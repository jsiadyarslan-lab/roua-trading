import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../common/prisma/prisma.service';
export declare class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly prisma;
    server: Server;
    private readonly logger;
    private readonly userSockets;
    private readonly socketUser;
    constructor(prisma: PrismaService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    sendToUser(userId: string, event: string, data: any): boolean;
    broadcast(event: string, data: any): void;
    isUserOnline(userId: string): boolean;
    getOnlineCount(): number;
    private _extractSessionFromCookie;
}
