const http = require("http");
const https = require("https");

const fileName =
  "眺めのいい部屋　-境界線あるいは皮膚に関する物語- (A ROOM WITH A VIEW -A Story concerning Borders or Skin - - Tetsuji Kurashige (1080p, h264).mp4";

const megaUrl =
  "https://bt7.api.mega.co.nz/cs/g" +
  "?x=7ecgM7gnDDCY" +
  "&n=Qrp13TBL" +
  "&fn=" +
  encodeURIComponent(fileName);

const server = http.createServer((req, res) => {
  if (!req.url.startsWith("/file")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const request = https.get(
    megaUrl,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://transfer.it/t/7ecgM7gnDDCY",
        "Origin": "https://transfer.it",
        "Range": "bytes=0-0"
      }
    },
    (response) => {
      response.resume();

      if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;

        if (location) {
          res.writeHead(302, {
            Location: location
          });
          res.end();
          return;
        }
      }

      res.writeHead(502);
      res.end(
        "MEGA did not return a download URL. Status: " +
        response.statusCode
      );
    }
  );

  request.on("error", (error) => {
    res.writeHead(502);
    res.end(error.message);
  });
});

const port = process.env.PORT || 3000;

server.listen(port, "0.0.0.0", () => {
  console.log("Server running on port " + port);
});
