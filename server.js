const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("TRANSFER PROXY IS WORKING\nPath: " + req.url);
});

const port = process.env.PORT || 3000;

server.listen(port, "0.0.0.0", () => {
  console.log("Server running on port " + port);
});
