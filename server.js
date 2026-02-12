require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const { UTApi } = require("uploadthing/server");

const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

const server = http.createServer(async (req, res) => {
  // Handle file upload via UTApi
  if (req.url === "/api/upload" && req.method.toLowerCase() === "post") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      try {
        const boundary = req.headers["content-type"].split("boundary=")[1];
        const buffer = Buffer.concat(chunks);

        // Parse multipart form data
        const parts = buffer.toString().split(`--${boundary}`);
        let fileData = null;
        let fileName = "";

        for (const part of parts) {
          if (part.includes("Content-Disposition") && part.includes("filename")) {
            const nameMatch = part.match(/filename="([^"]+)"/);
            if (nameMatch) fileName = nameMatch[1];

            const contentStart = part.indexOf("\r\n\r\n") + 4;
            const contentEnd = part.lastIndexOf("\r\n");
            if (contentStart > 3 && contentEnd > contentStart) {
              fileData = buffer.slice(
                buffer.indexOf(part) + contentStart,
                buffer.indexOf(part) + contentEnd
              );
            }
          }
        }

        if (!fileData || !fileName) {
          throw new Error("No file data found");
        }

        // Create a File object for UTApi
        const file = new File([fileData], fileName);

        // Upload to UploadThing
        const response = await utapi.uploadFiles(file);

        if (response.error) {
          throw new Error(response.error.message);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          url: response.data.url,
          key: response.data.key,
          name: response.data.name
        }));
      } catch (err) {
        console.error("Upload error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          message: err.message
        }));
      }
    });
    return;
  }

  // Handle favicon
  if (req.url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  let filePath = path.join(
    __dirname,
    "public",
    req.url === "/" ? "index.html" : req.url,
  );

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 - File Not Found</h1>", "utf8");
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": mime.lookup(filePath) });
      res.end(content, "utf8");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
