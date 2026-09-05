import { createClient } from "redis";
import { Server } from "socket.io";
import { routeRedisMessage } from "./eventRouter";

export const subscriber = createClient({
  url: process.env.REDIS_URL ?? "redis://pub-sub:6379",
});

let ioInstance: Server;
const subscribedChannels = new Set<string>();
const channelRefCount = new Map<string, number>();

export async function connectRedisSubscriber(io: Server) {
  ioInstance = io;
  try {
    await subscriber.connect();
    console.log("✅ Redis subscriber connected for Gateway");

    // Always listen to global:rooms for system-wide room deletion notifications
    await subscribeToChannel("global:rooms");
  } catch (error: any) {
    console.error("❌ Redis subscriber connection error:", error.message);
    process.exit(1);
  }
}

export async function subscribeToChannel(channel: string) {
  const count = channelRefCount.get(channel) ?? 0;

  if (count === 0) {
    await subscriber.subscribe(channel, (message, channelName) => {
      routeRedisMessage(ioInstance, message, channelName);
    });
    subscribedChannels.add(channel);
    console.log(`[Gateway] Subscribed to Redis channel: ${channel}`);
  }

  channelRefCount.set(channel, count + 1);
}

export async function unsubscribeFromChannel(channel: string) {
  const count = channelRefCount.get(channel) ?? 0;

  if (count <= 1) {
    if (subscribedChannels.has(channel) && channel !== "global:rooms") {
      await subscriber.unsubscribe(channel);
      subscribedChannels.delete(channel);
      console.log(`[Gateway] Unsubscribed from Redis channel: ${channel}`);
    }
    channelRefCount.delete(channel);
  } else {
    channelRefCount.set(channel, count - 1);
  }
}

export function isSubscribed(channel: string) {
  return subscribedChannels.has(channel);
}
