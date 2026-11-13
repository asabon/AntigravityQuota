// Minimal mock server simulating an Antigravity language_server / agy backend
import * as net from 'node:net';

const server = net.createServer((socket) => {
	socket.end();
});

server.listen(0, '127.0.0.1', () => {
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;
	// Output READY token with the allocated TCP port
	process.stdout.write(`READY:${port}\n`);
});

// Keep process alive until terminated
process.on('SIGTERM', () => {
	server.close(() => process.exit(0));
});
process.on('disconnect', () => {
	process.exit(0);
});
