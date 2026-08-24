import { Socket } from "socket.io";
import prisma from "./prisma";
import { subscribeToChannel } from "@/chatHandler";

export async function syncUserRoom(socket : Socket){
    if (!socket.data.joinedRooms) {
        socket.data.joinedRooms = new Set<string>();
    }

    const memberships = await prisma.roomMember.findMany({
        where : { user_id : socket.data.userId } ,
        include : { room : true }
    })

    for (const membership of memberships) {
        socket.join(membership.room.id)
        socket.data.joinedRooms.add(membership.room.id)
        await subscribeToChannel(`room:${membership.room.id}`)
    }
}

