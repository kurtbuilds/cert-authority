import {Command} from "commander";
import express, {Request, Response} from 'express'
import * as fs from 'fs'
import path from 'path'
import http_proxy from 'http-proxy'
import http from 'http'
import https from 'https'
import {spawn} from 'child_process'

const HTTPS = Boolean(process.env.HTTPS)
const PORT = process.env.PORT ?
    parseInt(process.env.PORT)
    : (HTTPS ? 8443 : 8000)
const SSL_CRT_FILE = process.env.SSL_CRT_FILE || '/Users/kurt/work/cert-authority/cert/local.kurtbuilds.com.crt'
const SSL_KEY_FILE = process.env.SSL_KEY_FILE || '/Users/kurt/work/cert-authority/cert/local.kurtbuilds.com.key'
const PROXY = process.env.PROXY
const CWD = process.cwd()

function template_directory(path: string, files: string): string {
    return `<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>Directory listing for ${path}</title>
</head>
<body>
<h1>Directory listing for ${path}</h1>
<hr>
<ul>
${files}
</ul>
<hr>
</body></html>`
}

function template_file(path: string, filename: string): string {
    return `<li><a href="${path}">${filename}</a></li>`
}


async function spawn_async(cmd: string, args: string[]): Promise<{
    stdout: string,
    stderr: string,
    code: number
}> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args)
        let out_buf: string[] = []
        let err_buf: string[] = []
        child.stdout.on('data', data => out_buf.push(data))
        child.stderr.on('data', data => err_buf.push(data))
        child.on('close', code => {
            if (code === 0) {
                resolve({
                    stdout: out_buf.join(''),
                    stderr: err_buf.join(''),
                    code,
                })
            } else {
                reject({
                    stdout: out_buf.join(''),
                    stderr: err_buf.join(''),
                    code,
                })
            }
        })
    })
}


async function main() {
    let program = new Command()
    program.addHelpText('after', `
Environment variables:
HTTPS: Server on HTTPS (values: true)
PORT: Port to run on (default: 8000 if http, 8443 if https)
SSL_CRT_FILE: Path to .crt file. Only used if HTTPS (value: filepath)
SSL_KEY_FILE: Path to .key file. Only used if HTTPS (value: filepath)
PROXY: Use a proxy server instead of file system. (Value: full URL for proxy target, e.g. https://www.google.com')
`)
    program.option('-s, --secure', 'Serve on HTTPS')
    program.argument('[proxy]')
    let parsed = program.parse() as any

    let proxy = parsed.proxy || PROXY
    let secure = parsed.secure || HTTPS

    // create proxy or create fs server
    let handler
    if (proxy) {
        handler = http_proxy.createProxyServer({target: proxy!})
    } else {
        handler = express()
        handler.get('*', (req: Request, res: Response) => {
            let encoded_path = req.path
            let true_path = decodeURIComponent(req.path)
            let fpath = path.join('.', true_path)
            try {
                let stat = fs.lstatSync(fpath)
                if (stat.isDirectory()) {
                    let index_html_path = path.join(fpath, 'index.html')
                    if (fs.existsSync(index_html_path)) {
                        // send the index.html
                        res.sendFile(index_html_path, {root: CWD})
                    } else {
                        // send a generated page
                        let files = fs.readdirSync(fpath)
                            .map(fname => template_file(path.join(encoded_path, encodeURIComponent(fname)), fname))
                            .join('\n')
                        let html = template_directory(true_path, files)
                        res.send(html)
                    }
                } else {
                    res.sendFile(fpath, {root: CWD})
                }
            } catch (e) {
                // file not found.
                console.error(e)
                res.send('File not found.')
            }
        })
    }

    // create server (HTTP or HTTPS)
    let server
    if (secure) {
        server = https.createServer({
            key: fs.readFileSync(SSL_KEY_FILE!, 'utf8'),
            cert: fs.readFileSync(SSL_CRT_FILE!, 'utf8'),
        }, handler as any)
    } else {
        server = http.createServer(handler as any)
    }

    // run server on PORT (default 8000 for HTTP, 8443 for HTTPS)
    await server.listen(PORT, '0.0.0.0')

    let schema = 'http'
    let host = ''
    if (secure) {
        schema = 'https'
        let {stdout} = await spawn_async('openssl', ['x509', '-text', '-noout', '-in', SSL_CRT_FILE]);
        let match = /DNS:([a-zA-Z0-9.]+)\s/.exec(stdout)
        if (match) host = match[1]
    }
    console.log(`Listening on ${schema}://${host}:${PORT}`)
}

main()
    .catch(e => console.log(e))