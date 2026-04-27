import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { validateDualDeviceMessage, type DualDeviceMessage } from "@stellar-frontier/protocol";

export type RelayClientRole = "pc" | "phone";

export interface RelayJoinRequest {
  roomId: string;
  clientId: string;
  role: RelayClientRole;
  token: string;
}

export interface RelayOutboundClient {
  clientId: string;
  roomId: string;
  role: RelayClientRole;
  token: string;
  send: (payload: string) => void;
}

export interface RelayRoomSnapshot {
  roomId: string;
  clients: Array<{ clientId: string; role: RelayClientRole }>;
}

export interface RelayRoomRegistry {
  join: (client: RelayOutboundClient) => RelayRoomSnapshot;
  leave: (client: RelayOutboundClient) => void;
  broadcast: (message: DualDeviceMessage) => number;
  snapshot: () => RelayRoomSnapshot[];
}

export interface RelayServerHandle {
  httpServer: Server;
  wsServer: WebSocketServer;
  registry: RelayRoomRegistry;
}

interface RelayRoom {
  roomId: string;
  token: string;
  phoneClientId?: string;
  clients: Map<string, RelayOutboundClient>;
}

const DEFAULT_PORT = 8787;

export function createRelayRoomRegistry(): RelayRoomRegistry {
  const rooms = new Map<string, RelayRoom>();

  return {
    join(client) {
      const room = getOrCreateRoom(rooms, client);
      validateRoomJoin(room, client);
      room.clients.set(client.clientId, client);
      if (client.role === "phone") {
        room.phoneClientId = client.clientId;
      }
      return snapshotRoom(room);
    },
    leave(client) {
      const room = rooms.get(client.roomId);
      if (!room) {
        return;
      }

      room.clients.delete(client.clientId);
      if (room.clients.size === 0) {
        rooms.delete(client.roomId);
      }
    },
    broadcast(message) {
      const room = rooms.get(message.roomId);
      if (!room) {
        return 0;
      }

      const encoded = JSON.stringify(message);
      let delivered = 0;
      for (const client of room.clients.values()) {
        if (client.clientId === message.clientId) {
          continue;
        }
        client.send(encoded);
        delivered += 1;
      }
      return delivered;
    },
    snapshot() {
      return Array.from(rooms.values(), snapshotRoom).sort((left, right) => left.roomId.localeCompare(right.roomId));
    },
  };
}

export function parseRelayJoinRequest(requestUrl = "/", host = "localhost"): RelayJoinRequest | null {
  const url = new URL(requestUrl, `http://${host}`);
  const roomId = url.searchParams.get("roomId")?.trim() ?? "";
  const clientId = url.searchParams.get("clientId")?.trim() ?? "";
  const role = url.searchParams.get("role")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";

  if (!roomId || !clientId || !token || (role !== "pc" && role !== "phone")) {
    return null;
  }

  return { roomId, clientId, role, token };
}

export function createRelayServer(registry: RelayRoomRegistry = createRelayRoomRegistry()): RelayServerHandle {
  const httpServer = createServer((request, response) => handleHealthRequest(request, response, registry));
  const wsServer = new WebSocketServer({ server: httpServer, path: "/relay" });

  wsServer.on("connection", (socket, request) => {
    const joinRequest = parseRelayJoinRequest(request.url, request.headers.host);
    if (!joinRequest) {
      socket.close(1008, "Invalid relay join request");
      return;
    }

    const client: RelayOutboundClient = {
      ...joinRequest,
      send: (payload) => sendIfOpen(socket, payload),
    };
    let snapshot: RelayRoomSnapshot;
    try {
      snapshot = registry.join(client);
    } catch (error) {
      socket.close(1008, error instanceof Error ? error.message : "Invalid relay join request");
      return;
    }

    sendIfOpen(socket, JSON.stringify(createConnectedMessage(client, snapshot)));
    registry.broadcast(createConnectedMessage(client, snapshot));

    socket.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (!message || message.roomId !== client.roomId || message.clientId !== client.clientId) {
        sendIfOpen(socket, JSON.stringify({ type: "relay.error", reason: "Invalid message envelope" }));
        return;
      }

      registry.broadcast(message);
    });

    socket.on("close", () => registry.leave(client));
  });

  return { httpServer, wsServer, registry };
}

function handleHealthRequest(request: IncomingMessage, response: ServerResponse, registry: RelayRoomRegistry) {
  if (request.url?.startsWith("/healthz")) {
    const rooms = registry.snapshot();
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.length, clients: rooms.reduce((count, room) => count + room.clients.length, 0) }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false, reason: "not_found" }));
}

function parseClientMessage(payload: string): DualDeviceMessage | null {
  try {
    const value = JSON.parse(payload) as unknown;
    return validateDualDeviceMessage(value) ? value : null;
  } catch {
    return null;
  }
}

function createConnectedMessage(client: RelayOutboundClient, snapshot: RelayRoomSnapshot): DualDeviceMessage {
  return {
    type: "link.connected",
    roomId: client.roomId,
    clientId: "relay",
    sequence: 0,
    sentAt: Date.now(),
    payload: {
      clientId: client.clientId,
      role: client.role,
      peers: snapshot.clients.filter((peer) => peer.clientId !== client.clientId),
    },
  };
}

function sendIfOpen(socket: WebSocket, payload: string) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
  }
}

function getOrCreateRoom(rooms: Map<string, RelayRoom>, client: RelayOutboundClient) {
  const existing = rooms.get(client.roomId);
  if (existing) {
    return existing;
  }

  if (client.role !== "pc") {
    throw new Error("PC host must create relay room first");
  }

  const room: RelayRoom = { roomId: client.roomId, token: client.token, clients: new Map<string, RelayOutboundClient>() };
  rooms.set(client.roomId, room);
  return room;
}

function validateRoomJoin(room: RelayRoom, client: RelayOutboundClient) {
  if (room.token !== client.token) {
    throw new Error("Invalid pairing token");
  }

  if (client.role === "phone" && room.phoneClientId && room.phoneClientId !== client.clientId) {
    throw new Error("Relay room already locked to a phone");
  }
}

function snapshotRoom(room: RelayRoom): RelayRoomSnapshot {
  return {
    roomId: room.roomId,
    clients: Array.from(room.clients.values(), ({ clientId, role }) => ({ clientId, role })).sort((left, right) =>
      left.clientId.localeCompare(right.clientId),
    ),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const { httpServer } = createRelayServer();
  httpServer.listen(port, () => {
    console.log(`Stellar Frontier relay listening on :${port}`);
  });
}
