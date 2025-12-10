const clients = new Set();

export function sseHandler(req, res) {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send an initial comment to establish the stream
  res.write(': connected\n\n');

  const client = res;
  clients.add(client);

  req.on('close', () => {
    clients.delete(client);
  });
}

export function broadcastActivity(obj) {
  const payload = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (e) {
      // ignore broken connections; native 'close' handler will clean up
    }
  }
}

// Simple keep-alive ping to prevent some proxies from closing the connection
setInterval(() => {
  for (const res of clients) {
    try {
      res.write(': ping\n\n');
    } catch (e) {}
  }
}, 20000);

export default { sseHandler, broadcastActivity };
