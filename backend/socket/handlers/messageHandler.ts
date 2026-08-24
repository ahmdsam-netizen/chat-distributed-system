import { Server, Socket } from "socket.io"
import prisma from "@/lib/prisma"
import { typingInRoom , sendRoomMessage } from "./pubsubEvents/pubsubFunctions"

export default function messageHandler(io : Server , socket : Socket){
    socket.on('message_in_room' , async (data : {text : string , roomname : string, target_mode?: 'all' | 'to' | 'not_to' | 'not_to_all', target_users?: string[]}) => {
        try {
            await sendRoomMessage(socket , data)
        } catch (error : any) {
            console.error("message_in_room error:", error)
            socket.emit('error' , {message : error?.message ?? "Failed to send message"})
        }
    })

    socket.on('typing_in_room' , async (data : {roomname : string}) => {
        try {
            await typingInRoom(socket , data) 
        } catch (error : any) {
            socket.emit('error' , {message : "Failed to emit typing"})
        }
    })

    socket.on('get_message_of_room' , async (data : {roomname : string, cursor? : string, limit? : number}) => {
        try {
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

            const limit = Math.min(Math.max(Number(data.limit) || 30, 1), 100);
            const cursorDate = data.cursor ? new Date(data.cursor) : null;
            const currentUsername = socket.data.username;

            // Query only messages sent at or after user joined the room
            // and strictly before cursor if paginating backward,
            // matching target_mode rules
            const messages = await prisma.roomMessage.findMany({
                where : {
                    room_id : member.room.id,
                    sent_at : {
                        gte : member.joined_at,
                        ...(cursorDate ? { lt : cursorDate } : {})
                    },
                    OR : [
                        { type : "system" },
                        { user_id : socket.data.userId },
                        { target_mode : "all" },
                        {
                            target_mode : "to",
                            target_users : { has : currentUsername }
                        },
                        {
                            target_mode : "not_to",
                            NOT : {
                                target_users : { has : currentUsername }
                            }
                        }
                    ]
                } , 
                include : {user : {select : {username : true}}} ,
                orderBy : { sent_at : "desc"},
                take : limit + 1
            })

            const hasMore = messages.length > limit;
            const chunk = hasMore ? messages.slice(0, limit) : messages;
            const nextCursor = hasMore && chunk.length > 0 ? chunk[chunk.length - 1].sent_at.toISOString() : null;

            // Reverse chunk to return in ascending chronological order
            chunk.reverse();

            socket.emit('group_chat' , {
                roomname: member.room.roomname,
                messages: chunk.map(message => ({
                    id : message.id,
                    type : message.type,
                    target_mode : message.target_mode,
                    target_users : message.target_users,
                    content : message.content ,
                    sent_at : message.sent_at.toISOString() ,
                    sent_by : message.user?.username ?? (message.type === 'system' ? 'system' : 'Unknown') ,
                    sent_to : member.room.roomname 
                })),
                hasMore,
                nextCursor,
                isInitial: !cursorDate
            })

        } catch (error : any) {
            console.error("get_message_of_room error:", error)
            socket.emit('error' , {message : "Failed to fetch messages"})
        }
    })
}



