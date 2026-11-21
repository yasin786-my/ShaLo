# ShaLo

Share files between any devices on the same Wi-Fi. No accounts, no cloud, no internet needed.

One device runs the ShaLo server. Every other device opens its address in a browser, sends files, and downloads what others have shared.

## Features

- Works in any modern browser: iPhone, iPad, Android, Windows, Mac, Linux, Chromebook
- Two-way sharing: any device can send and receive
- Drag and drop on desktop, file picker on phones
- Multiple files at once, with a progress bar for each
- Shows which device sent each file
- The shared folder updates on every device within a few seconds
- Files up to 2 GB each

## Quick start

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
node server.js
```

The server prints the addresses other devices can use:

```
ShaLo is running. Open it from any device on this network:
  http://192.168.1.23:3000
```

Open that address on each device. All devices must be on the same Wi-Fi.

## Phone to phone

- **With a laptop or PC:** run the server on it, then open its address on both phones.
- **Without a laptop:** one Android phone can host using [Termux](https://termux.dev):
  ```
  pkg install nodejs
  cd shalo
  npm install
  node server.js
  ```
  Keep Termux open so Android doesn't stop the server. iPhones can send and receive but can't host.
- **No Wi-Fi:** turn on the host phone's hotspot and join it from the other phone.

## Command line

Devices without a browser can use `curl`:

```bash
# Send a file
curl -F "files=@photo.jpg" http://192.168.1.23:3000/upload

# List shared files
curl http://192.168.1.23:3000/api/files
```

## Project structure

```
server.js          Express server: upload, download and file list
public/index.html  The ShaLo interface (single file, no build step)
shared/            Files people send (created on first run)
meta.json          Which device sent each file (created on first upload)
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/` | The ShaLo interface |
| GET | `/api/files` | Lists shared files, newest first |
| GET | `/api/info` | Lists the addresses other devices can use |
| POST | `/upload` | Sends one or more files (form field `files`) |
| GET | `/files/<id>` | Downloads a file under its original name |

`/upload` also reads the optional headers `X-Device-Id` and `X-Device-Name` to label the sender.

## Troubleshooting

- **Other devices can't connect:** allow port 3000 through the host's firewall. Windows and macOS usually ask the first time.
- **Still can't connect:** some guest and public Wi-Fi networks stop devices from reaching each other. Use a home network or a hotspot.
- **Fonts look plain:** the page loads fonts from Google Fonts and falls back to system fonts when there's no internet. Everything else still works.

## Security

ShaLo has no password. Anyone on the same network can send and download files. Use it on networks you trust, not on public Wi-Fi.

Files stay in the `shared/` folder on the host device until you delete them.

## Changing the port or size limit

Edit `PORT` and `fileSize` at the top of `server.js`.
