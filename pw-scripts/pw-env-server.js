// Minimal login page so samples/pw-env.spec.ts has something real to drive.
// Started automatically by playwright.config.ts's webServer block.
const http = require("http");

http.createServer((req, res) => {
    if (req.url.startsWith("/login")) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end('<form><input id="email"><input id="password" type="password"><button id="submit">Go</button></form>');
        return;
    }

    res.writeHead(404);
    res.end("not found");
}).listen(8931, "127.0.0.1");
