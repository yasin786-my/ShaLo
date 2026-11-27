# ShaLo

Share files between any devices on the same Wi-Fi. No accounts, no cloud, no internet needed.

One device runs the ShaLo server. Other devices join it with a one-time code, then send files and download what others have shared.

## Features

- Works in any modern browser: iPhone, iPad, Android, Windows, Mac, Linux, Chromebook
- Two-way sharing: any joined device can send and receive
- Join by scanning a QR code or by typing a 6-digit code
- Open photos, videos, audio, PDFs and text files right in the browser, with previous and next buttons
- Drag and drop on desktop, file picker on phones
- Multiple files at once, with a progress bar for each
- Shows which device sent each file
- Connected devices list for the host: name, address, online or last seen, and sign out one device or all
- The shared folder updates on every device within a few seconds
- Files up to 2 GB each

## Quick start

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
node server.js
```

1. On the device running ShaLo, open `http://localhost:3000`.
2. Tap **Add a device**. A QR code and a 6-digit code appear.
3. On the other device, scan the QR code with the camera. Or open the address shown in the window and type the 6-digit code.

All devices must be on the same Wi-Fi.

## How joining works

- The code is made when **Add a device** opens and deleted when the window closes.
- A code works **once** and expires after **2 minutes**. When someone joins, a fresh code appears right away for the next device.
- A joined device stays signed in for 12 hours. The **Devices** button shows everyone who has joined, whether they are online, and lets you sign out one device or all of them.
- Only the device running ShaLo can make codes and see the device list. Joined devices can send and receive but cannot add others.
- Joining is limited to 8 tries per minute from one device. Across all devices, 5 wrong guesses cancel the current code, and a new one appears after a 30 second pause, so a code can't be guessed even from many addresses.

## Phone to phone

- **With a laptop or PC:** run the server on it, then join from both phones.
- **Without a laptop:** one Android phone can host using [Termux](https://termux.dev):
  ```
  pkg install nodejs
  cd shalo
  npm install
  node server.js
  ```
  Open `http://localhost:3000` in the browser on that same phone to make codes. Keep Termux open so Android doesn't stop the server. iPhones can join but can't host.
- **No Wi-Fi:** turn on the host phone's hotspot and join it from the other phone.

## Project structure

```
server.js          Express server: join codes, upload, download, file list
public/index.html  The ShaLo interface (single file, no build step)
public/join.html   The page other devices see until they join
public/qr.js       QR code generator, no dependencies
public/logo.png, favicon.svg, favicon-32.png, apple-touch-icon.png   Logo and icons
shared/            Files people send (created on first run)
meta.json          Which device sent each file (created on first upload)
```

## API

Everything except joining needs a joined device (or the host).

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/` | The interface, or the code page if not joined |
| GET | `/join?code=123456` | Joins with a code (what the QR code opens) |
| POST | `/api/join` | Joins with a code (`{"code": "123456"}`) |
| GET | `/api/files` | Lists shared files, newest first |
| POST | `/upload` | Sends one or more files (form field `files`) |
| GET | `/files/<id>` | Downloads a file under its original name |
| GET | `/view/<id>` | Opens a safe file type in the browser (photos, video, audio, PDF, text) |
| GET | `/api/devices` | Host only: devices that have joined |
| DELETE | `/api/devices/<id>` | Host only: sign one device out |
| POST | `/api/hello` | A joined device sets its display name (known device types only) |
| GET, DELETE | `/api/invite` | Host only: current join code, or delete it |
| POST | `/api/revoke` | Host only: sign out all devices |

## Security

What ShaLo protects:
- Nobody can list, upload or download without a one-time code or a session from one.
- ShaLo only answers to its IP address, `localhost` or its own computer name. This stops a website from tricking the host device's browser into reading your files by pointing its own domain at ShaLo (DNS rebinding).
- Who sent a file is decided by the server from the session, never by the device, so nobody can send a file in someone else's name or call themselves "Host". Devices can only be named after a known type such as iPhone or Windows PC.
- The shared folder has a total size limit (10 GB), so one device can't fill the host's disk.
- Other websites can't send files to ShaLo through your browser.
- Only photos, video, audio, PDF and plain text can open in the browser, and they are sandboxed. Anything else (HTML, SVG, scripts) can only be downloaded, so a shared file can never run code in the page.
- Filenames are cleaned, and the page is served with strict security headers.

What it does not protect:
- Traffic is plain `http://`, like most local tools. Someone who has joined your Wi-Fi could in theory read it, so use a home network with a WPA2 or WPA3 password and don't use ShaLo on public Wi-Fi.
- Files stay in `shared/` on the host until you delete them, and anyone who has joined can download them.
- Anyone with access to the host device itself can open ShaLo without a code.

## Troubleshooting

- **Other devices can't connect:** allow port 3000 through the host's firewall. Windows and macOS usually ask the first time.
- **Still can't connect:** some guest and public Wi-Fi networks stop devices from reaching each other. Use a home network or a hotspot.
- **A file link asks for a code:** that is the protection working. Enter the 6-digit code and you land on the file. Apps and scripts that call ShaLo without joining get a JSON error instead.
- **A device is missing from the list:** the list shows devices that joined ShaLo with a code, not every device on your Wi-Fi. A device only appears after it joins, and disappears when you sign it out or it has been signed in for 12 hours.
- **"ShaLo only answers to its IP address":** you opened it with a custom domain name. Use the IP address shown in **Add a device**, `localhost`, or the computer's own name.
- **"ShaLo's storage is full":** the shared folder reached `MAX_STORAGE`. Delete files from the `shared` folder, or raise the limit.
- **"A new code appears in … seconds":** five wrong codes were tried, so ShaLo paused. Wait a moment and it makes a fresh one.
- **"Code expired":** codes last 2 minutes and work once. Tap **Add a device** again for a fresh one.
- **Code opens the wrong page:** if the host has more than one network, pick the one the other device is on in the Add a device window.
- **No Open button on a file:** only photos, videos, audio, PDFs and text files can open in the browser. Use Download for the rest. iPhone HEIC photos need Download too, because most browsers can't show them.
- **PDF looks cut off on a phone:** some phone browsers show only the first page inside the viewer. Tap **New tab** to open the whole PDF.
- **Copy does nothing on a phone:** some phone browsers block the clipboard on plain `http://` pages. Select the address and copy it by hand.
- **Fonts look plain:** the pages load fonts from Google Fonts and fall back to system fonts with no internet. Everything else still works.

## Changing the port or limits

Edit these at the top of `server.js`: `PORT`, `INVITE_MS`, `SESSION_MS`, `MAX_STORAGE`, `MAX_WRONG` and `LOCK_MS`. The per-file limit is `fileSize` further down.
