// 온라인 방 서버: index.html을 서빙하고, 호스트 ↔ 게스트 메시지를 중계한다.
// 게임 시뮬레이션은 호스트 브라우저가 하고, 서버는 방 관리 + 릴레이만 한다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

const PORT = +process.env.PORT || 3000;
// 초대 링크에 쓰는 고정 공개 주소. 다른 주소로 바꾸려면 PUBLIC_URL=... npm start (빈 값이면 접속한 주소 그대로)
const PUBLIC_URL = process.env.PUBLIC_URL ?? 'https://ming-mang-mong.jjoon.cloud';
const page = new URL('./index.html', import.meta.url);

const server = createServer(async (req, res) => {
  if (new URL(req.url, 'http://x').pathname !== '/') return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(await readFile(page));
});

const lanUrls = () => Object.values(networkInterfaces()).flat()
  .filter(a => a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${PORT}`);

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const rooms = new Map(); // code -> { code, host, guests: Map<seat, ws>, started }
const send = (ws, m) => ws?.readyState === 1 && ws.send(typeof m === 'string' ? m : JSON.stringify(m));
const newCode = () => {
  let c;
  do c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); while (rooms.has(c));
  return c;
};
function broadcastSeats(r) {
  const seats = [0, ...[...r.guests.keys()].sort()];
  send(r.host, { t: 'seats', seats });
  for (const g of r.guests.values()) send(g, { t: 'seats', seats });
}

wss.on('connection', ws => {
  let room = null, seat = -1;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'create' && !room) {
      room = { code: newCode(), host: ws, guests: new Map(), started: false }; seat = 0;
      rooms.set(room.code, room);
      send(ws, { t: 'created', code: room.code, url: PUBLIC_URL, lan: lanUrls() });
    } else if (m.t === 'join' && !room) {
      const r = rooms.get(String(m.code).toUpperCase());
      if (!r) return send(ws, { t: 'err', msg: '방을 찾을 수 없어요' });
      if (r.started) return send(ws, { t: 'err', msg: '이미 게임이 시작된 방이에요' });
      const free = [1, 2].find(s => !r.guests.has(s));
      if (!free) return send(ws, { t: 'err', msg: '방이 꽉 찼어요 (최대 3명)' });
      room = r; seat = free; r.guests.set(seat, ws);
      send(ws, { t: 'joined', seat, code: r.code, url: PUBLIC_URL });
      broadcastSeats(r);
    } else if (room && seat === 0) { // 호스트 → 모든 게스트 (시작 신호, 스냅샷)
      if (m.t === 'start') room.started = true;
      const s = JSON.stringify(m);
      for (const g of room.guests.values()) send(g, s);
    } else if (room && m.t === 'in') { // 게스트 입력 → 호스트
      send(room.host, { t: 'in', seat, x: +m.x || 0, z: +m.z || 0, j: !!m.j, r: !!m.r });
    } else if (room && m.t === 'pick') { // 게스트 캐릭터 선택 → 호스트 (중복 검사는 호스트가)
      send(room.host, { t: 'pick', seat, c: m.c | 0 });
    }
  });
  ws.on('close', () => {
    if (!room) return;
    if (seat === 0) {
      for (const g of room.guests.values()) send(g, { t: 'closed' });
      rooms.delete(room.code);
    } else {
      room.guests.delete(seat);
      send(room.host, { t: 'left', seat });
      broadcastSeats(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Ming Mang Mong 서버 실행 중 → http://localhost:${PORT}`);
  if (PUBLIC_URL) console.log(`  초대 링크 주소 → ${PUBLIC_URL}`);
  for (const u of lanUrls()) console.log(`  같은 와이파이의 친구는 → ${u}`);
});
