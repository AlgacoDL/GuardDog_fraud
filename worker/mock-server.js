const http = require('http');

const server = http.createServer((req, res) => {
  // Only handle POST requests
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  // Simulate worker processing time (50-150ms)
  const processingTime = 50 + Math.random() * 100;
  
  setTimeout(() => {
    // Always return 200 with correlation ID (simulating fail-open)
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Correlation-ID': 'mock-' + Date.now(),
      'X-Processing-Time': processingTime + 'ms'
    });
    
    res.end(JSON.stringify({
      status: 'ok',
      degraded: false,
      processing_time: processingTime
    }));
  }, processingTime);
});

const PORT = 8787;
server.listen(PORT, () => {
  console.log(`Mock worker server running on http://localhost:${PORT}`);
  console.log('Ready for k6 testing');
});
