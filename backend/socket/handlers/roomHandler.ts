import { Server, Socket } from "socket.io"
import prisma from "@/lib/prisma"
import { createRoom , joinRoom , leaveRoom } from "./pubsubEvents/pubsubFunctions"

export default function (io : Server , socket : Socket){
    socket.on('create_room' , async (data : {roomname : string , description : string }) => {
        try {
            await createRoom(socket , data) 
        } catch (error : any) {
            console.error("create_room error:", error)
            socket.emit('error' , {message : error?.message ?? "Failed to create room"})
        }
    })

    socket.on('join_room' , async (data : {roomname : string}) => {
        try {
            await joinRoom(socket , data)
        } catch (error : any) {
            console.error("join_room error:", error)
            socket.emit('error' , {message : error?.message ?? "Failed to join room"})
        }
    })

    socket.on('leave_room' , async (data : {roomname : string}) => {
        try {
            await leaveRoom(socket , data) 
        } catch (error : any) {
            console.error("leave_room error:", error)
            socket.emit('error' , {message : error?.message ?? "Failed to leave room"})
        }
    })

    socket.on('list_room' , async (data : {filter : string}) => {
        try {
            const getRooms = await prisma.room.findMany({
                where : {
                    roomname : {contains : data.filter , mode : "insensitive"}
                } , 
                include : {
                    _count : {select : {members : true}},
                    members : {
                        where : { user_id : socket.data.userId },
                        select : { id : true }
                    }
                }
            })

            socket.emit('filter_rooms' , getRooms.map(room => ({
                roomname : room.roomname , 
                description: room.description,
                admin : room.created_by ,
                created_at : room.created_at ,
                members : room._count.members,
                isMember: room.members.length > 0
            })))

        } catch (error : any) {
            console.error("list_room error:", error)
            socket.emit('error' , {message : error?.message ?? "Failed to list rooms"})
        }
    })

    socket.on('get_room_members' , async (data : {roomname : string}) => {
        try {
            const room = await prisma.room.findFirst({
                where : { roomname : data.roomname },
                include : {
                    members : {
                        include : {
                            user : {
                                select : {
                                    id : true,
                                    username : true
                                }
                            }
                        }
                    }
                }
            })

            if (!room) {
                socket.emit('error', { message : "Room does not exist" })
                return
            }

            socket.emit('room_members', {
                roomname : room.roomname,
                members : room.members.map(m => ({
                    id : m.user.id,
                    username : m.user.username,
                    joined_at : m.joined_at
                }))
            })

        } catch (error : any) {
            console.error("get_room_members error:", error)
            socket.emit('error', { message : error?.message ?? "Failed to fetch room members" })
        }
    })
}