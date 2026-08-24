import { Server } from "socket.io";

export const eventHandlers = {
    'typing' : (io : Server , id : string , parsed : any) => {
        return io.to(id).emit('typing' , parsed) ;
    },
    'chat' : (io : Server , id : string , parsed : any) => {
        if (parsed.target_mode === 'to' || parsed.target_mode === 'not_to' || parsed.target_mode === 'not_to_all') {
            const roomSockets = io.sockets.adapter.rooms.get(id);
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const sock = io.sockets.sockets.get(socketId);
                    if (!sock) continue;
                    const username = sock.data.username;
                    const isSender = username === parsed.from;
                    const isTarget = Array.isArray(parsed.target_users) && parsed.target_users.includes(username);

                    let shouldDeliver = false;
                    if (isSender) {
                        shouldDeliver = true;
                    } else if (parsed.target_mode === 'to') {
                        shouldDeliver = isTarget;
                    } else if (parsed.target_mode === 'not_to') {
                        shouldDeliver = !isTarget;
                    } else if (parsed.target_mode === 'not_to_all') {
                        shouldDeliver = false;
                    }

                    if (shouldDeliver) {
                        sock.emit('chat', parsed);
                    }
                }
                return;
            }
        }

        return io.to(id).emit('chat' , parsed) ;
    },
    'join' : (io : Server , id : string , parsed : any) => {
        return io.to(id).emit('join' , parsed) ;
    },
    'leave' : (io : Server , id : string , parsed : any) => {
        return io.to(id).emit('leave' , parsed) ;
    },
    'room_deleted' : (io : Server , id : string , parsed : any) => {
        // Broadcast to ALL connected users globally to update their search results
        return io.emit('room_deleted' , parsed) ;
    }
}