-- CreateTable
CREATE TABLE "EAToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'MT5 EA',
    "mt5AccountNumber" TEXT,
    "mt5Server" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "EAToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EAToken_token_idx" ON "EAToken"("token");

-- CreateIndex
CREATE INDEX "EAToken_userId_idx" ON "EAToken"("userId");

-- CreateIndex
CREATE INDEX "EAToken_userId_isActive_idx" ON "EAToken"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "EAToken" ADD CONSTRAINT "EAToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
