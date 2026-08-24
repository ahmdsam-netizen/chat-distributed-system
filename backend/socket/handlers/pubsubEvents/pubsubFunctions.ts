import prisma from "@/lib/prisma"
import { publisher } from "@/redisClient"
import { subscribeToChannel, unsubscribeFromChannel, isSubscribed } from "@/chatHandler"
import { Socket } from "socket.io"

// Helper function for publishing events with error handling
// payload is something --- that publish function just pass - where it is sent
// and channel is the string --- publish function search for such subscriber if exist then pass it
async function publishEvent(channel: string, payload: any) {
    try {
        const numSubscribers = await publisher.publish(channel, JSON.stringify(payload))
        if (numSubscribers === 0) {
            console.log(`No subscribers for channel: ${channel}`)
        }
        return numSubscribers
    } catch (error: any) {
        console.error(`Failed to publish to ${channel}:`, error.message)
        throw error
    }
}

// Helper function for message validation
function validateMessage(text: string, maxLength: number = 5000): { valid: boolean; error?: string } {
    if (!text || typeof text !== 'string') {
        return { valid: false, error: 'Message must be a string' }
    }
    
    const trimmed = text.trim()
    if (trimmed.length === 0) {
        return { valid: false, error: 'Message cannot be empty' }
    }
    
    if (trimmed.length > maxLength) {
        return { valid: false, error: `Message exceeds maximum length of ${maxLength} characters` }
    }
    
    return { valid: true }
}

export async function typingInRoom(socket : Socket , data : {roomname : string}){
    try {
        const member = await prisma.roomMember.findFirst({
            where : {
                user_id : socket.data.userId,
                room : { roomname : data.roomname }
            },
            include : { room : true }
        })

        if(!member) {
            socket.emit('error' , {message : "Room does not exist or not a member"})
            return 
        }

        const payload = {
            event_type: 'typing',
            username : socket.data.username , 
            roomname : member.room.roomname
        }

        await publishEvent(`room:${member.room.id}` , payload)
        
    } catch (error : any) {
        socket.emit('error' , {message : "Failed to emit typing"})
    }
}

export async function sendRoomMessage(socket : Socket , data : {text : string , roomname : string, target_mode?: 'all' | 'to' | 'not_to' | 'not_to_all', target_users?: string[]}){
    try {
        const validation = validateMessage(data.text)
        if (!validation.valid) {
            socket.emit('error' , { message : validation.error })
            return
        }

        const member = await prisma.roomMember.findFirst({
            where : {
                user_id : socket.data.userId,
                room : { roomname : data.roomname }
            },
            include : { room : true }
        })

        if(!member) {
            socket.emit('error' , { message : "Room does not exist or not a member"})
            return 
        }

        // Ensure socket is joined to the socket room and subscribed to Redis channel
        if (!socket.rooms.has(member.room.id)) {
            socket.join(member.room.id);
            if (!socket.data.joinedRooms) socket.data.joinedRooms = new Set<string>();
            socket.data.joinedRooms.add(member.room.id);
        }
        if (!isSubscribed(`room:${member.room.id}`)) {
            await subscribeToChannel(`room:${member.room.id}`);
        }

        const targetMode = data.target_mode === 'to' || data.target_mode === 'not_to' || data.target_mode === 'not_to_all' ? data.target_mode : 'all';
        const targetUsers = Array.isArray(data.target_users) ? data.target_users.filter(u => typeof u === 'string' && u.trim().length > 0) : [];

        const message = await prisma.roomMessage.create({
            data : {
                content : data.text ,
                type : "chat",
                target_mode : targetMode,
                target_users : targetUsers,
                room_id : member.room.id ,
                user_id : socket.data.userId ,
            }
        })
        const payload = {
            id : message.id,
            event_type: 'chat',
            chat_type: 'room',
            type : 'chat',
            target_mode : targetMode,
            target_users : targetUsers,
            from : socket.data.username , 
            text : message.content , 
            to : member.room.roomname , 
            sent_at : message.sent_at 
        }

        await publishEvent(`room:${member.room.id}` , payload)
    } catch (error : any) {
        console.error("sendRoomMessage error:", error)
        socket.emit('error' , {message : error?.message ?? "Failed to send message"})
    }
}


export async function createRoom(socket : Socket , data : {roomname : string , description : string}){
    try {
        const existingRoom = await prisma.room.findFirst({
            where : {roomname : data.roomname}
        })            

        if(existingRoom) {
            socket.emit('error' , { message : "Room already exists"})
            return 
        }

        const now = new Date();
        const room = await prisma.room.create({
            data : {
                roomname : data.roomname , 
                description : data.description ,
                created_by : socket.data.username ,
                created_at : now,
                members : {
                    create : {
                        user_id : socket.data.userId,
                        joined_at : now
                    }
                }
            }
        })

        // Record room creation system event
        await prisma.roomMessage.create({
            data : {
                content : `${socket.data.username} created room #${room.roomname}`,
                type : "system",
                sent_at : now,
                room_id : room.id,
                user_id : socket.data.userId
            }
        })

        socket.join(room.id)
        if (!socket.data.joinedRooms) socket.data.joinedRooms = new Set<string>();
        socket.data.joinedRooms.add(room.id);

        socket.emit('room_created' , {roomname : room.roomname})

        await subscribeToChannel(`room:${room.id}`)

    } catch (error : any) {
        console.error("createRoom error:", error);
        socket.emit('error' , {message : error?.message ?? "Failed to create room"})
    }
}

export async function joinRoom(socket : Socket , data : {roomname : string}){
    try {
        const existingRoom = await prisma.room.findFirst({
            where : {roomname : data.roomname}
        })            

        if(!existingRoom) {
            socket.emit('error' , {message : "Room doesn't exist"})
            return
        }

        const existingMember = await prisma.roomMember.findUnique({
            where : {
                user_id_room_id : {
                    user_id : socket.data.userId,
                    room_id : existingRoom.id
                }
            }
        })

        if(existingMember) {
            socket.emit('error' , {message : "Already a member"})
            return
        }

        const joinTime = new Date();
        await prisma.roomMember.create({
            data : {
                user_id : socket.data.userId,
                room_id : existingRoom.id,
                joined_at : joinTime
            }
        })

        // Record system join message
        const systemMessage = await prisma.roomMessage.create({
            data : {
                content : `${socket.data.username} joined the room`,
                type : "system",
                sent_at : joinTime,
                room_id : existingRoom.id,
                user_id : socket.data.userId
            }
        })

        socket.join(existingRoom.id)
        if (!socket.data.joinedRooms) socket.data.joinedRooms = new Set<string>();
        socket.data.joinedRooms.add(existingRoom.id);

        socket.emit('joined_room' , {roomname : existingRoom.roomname})

        // Broadcast join event to all members in the room in sequential order
        const payload = {
            id : systemMessage.id,
            event_type: 'chat',
            chat_type: 'room',
            type : 'system',
            from : 'system',
            text : systemMessage.content,
            to : existingRoom.roomname,
            sent_at : systemMessage.sent_at,
            member_change: 'join',
            member: {
                id: socket.data.userId,
                username: socket.data.username,
                joined_at: joinTime.toISOString()
            }
        }
        await publishEvent(`room:${existingRoom.id}` , payload)

        if(!isSubscribed(`room:${existingRoom.id}`)){
            await subscribeToChannel(`room:${existingRoom.id}`)
        }
    } catch (error : any) {
        console.error("joinRoom error:", error)
        socket.emit('error' , {message : error?.message ?? "Failed to join room"})
    }
}

export async function leaveRoom(socket : Socket , data : {roomname : string}){
    try {
        const existingRoom = await prisma.room.findFirst({
            where : {roomname : data.roomname}
        })            

        if(!existingRoom){
            socket.emit('error' , {message : "Room doesn't exist"})
            return     
        }

        const existingMember = await prisma.roomMember.findUnique({
            where : {
                user_id_room_id : {
                    user_id : socket.data.userId,
                    room_id : existingRoom.id
                }
            }
        })

        if(!existingMember){
            socket.emit('error' , {message : "Not a member of this group"})
            return
        }

        const leaveTime = new Date();

        // Record system leave message before removing membership
        const systemMessage = await prisma.roomMessage.create({
            data : {
                content : `${socket.data.username} left the room`,
                type : "system",
                sent_at : leaveTime,
                room_id : existingRoom.id,
                user_id : socket.data.userId
            }
        })

        // Delete RoomMember record
        await prisma.roomMember.delete({
            where : {
                user_id_room_id : {
                    user_id : socket.data.userId,
                    room_id : existingRoom.id
                }
            }
        })

        socket.leave(existingRoom.id)
        if (socket.data.joinedRooms) {
            socket.data.joinedRooms.delete(existingRoom.id);
        }
        socket.emit('left_room' , {roomname : existingRoom.roomname})

        // Broadcast leave system event to remaining members in room
        const payload = {
            id : systemMessage.id,
            event_type: 'chat',
            chat_type: 'room',
            type : 'system',
            from : 'system',
            text : systemMessage.content,
            to : existingRoom.roomname,
            sent_at : systemMessage.sent_at,
            member_change: 'leave',
            member: {
                id: socket.data.userId,
                username: socket.data.username
            }
        }
        await publishEvent(`room:${existingRoom.id}` , payload)

        // Cleanup local instance subscription for this socket
        await unsubscribeFromChannel(`room:${existingRoom.id}`);

        // Check remaining DB members count across all instances
        const remainingMembersCount = await prisma.roomMember.count({
            where: { room_id: existingRoom.id }
        });

        // Only delete room and its messages when NO members remain in DB
        if (remainingMembersCount === 0) {
            // Delete all messages in the room
            await prisma.roomMessage.deleteMany({
                where : {room_id : existingRoom.id}
            })
            
            // Delete the room
            await prisma.room.delete({
                where : {id : existingRoom.id}
            })
            
            // Notify all users globally that room was deleted
            const deletePayload = {
                event_type: 'room_deleted',
                roomname : existingRoom.roomname,
                roomId : existingRoom.id
            }
            
            await publishEvent(`global:rooms` , deletePayload)
            
            console.log(`✅ Room '${existingRoom.roomname}' deleted (no members remaining in DB)`)
        }

    } catch (error : any) {
        console.error("leaveRoom error:", error)
        socket.emit('error' , {message : error?.message ?? "Failed to leave room"})
    }
}