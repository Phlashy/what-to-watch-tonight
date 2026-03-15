# Raspberry Pi 5 — Fresh Setup Guide

How to set up a brand new Pi 5 as a headless server, from unboxing to SSH access. Written for macOS. Copy this into any project that will run on a Pi.

---

## What You Need

- Raspberry Pi 5 (starter kit is ideal: case, active cooler, USB-C power, microSD with OS)
- Ethernet cable (connect Pi to your router/modem)
- A computer with a microSD card slot or USB card reader

> **Your Mac's SD card slot** (right side on 2021+ MacBook Pro) works with a full-size SD adapter. If your kit only has a USB-A card reader and your Mac only has USB-C, you'll need a USB-C hub or another computer with USB-A.

---

## Option A: Use Raspberry Pi Imager (Easiest)

If you can re-flash the SD card, this is the cleanest path — SSH, hostname, and user are pre-configured before first boot.

1. Install **Raspberry Pi Imager** on your Mac: https://www.raspberrypi.com/software/
2. Insert the microSD card into your Mac
3. Open Raspberry Pi Imager:
   - **Device**: Raspberry Pi 5
   - **OS**: Raspberry Pi OS (64-bit) Lite — under "Raspberry Pi OS (other)". Choose Lite for a headless server (no desktop).
   - **Storage**: your microSD card
4. Click **Next**, then **Edit Settings**:
   - **Hostname**: pick a name (e.g. `mypi`) — becomes `mypi.local` on your network
   - **Username/password**: pick something you'll remember
   - **Wi-Fi**: optional if you have ethernet
   - **Services tab**: Enable SSH → "Use password authentication"
5. Save, confirm, let it write and verify
6. Skip to **First Boot** below

> **Imager won't install?** (e.g. "Can't find Java Runtime") — Use Option B instead.

---

## Option B: Use the Pre-Loaded SD Card (What We Actually Did)

Starter kits ship with the OS already on the microSD. You can use it as-is, but SSH isn't enabled by default. Fix that by adding two small files to the boot partition.

### Enable SSH

1. Insert the microSD into a computer (any computer with a card reader)
2. It mounts as a volume called `bootfs`
3. Create an empty file called `ssh`:
```bash
touch /Volumes/bootfs/ssh
```

### Create a user account

4. Generate a password hash (replace `yourpassword` with your chosen password):
```bash
openssl passwd -1 yourpassword
```
This outputs a string like `$1$aBcD$xyz123...`

5. Create the user config file (replace `yourusername` and the hash):
```bash
echo 'yourusername:$1$aBcD$xyz123...' > /Volumes/bootfs/userconf.txt
```

### Eject and go

6. Eject the SD card:
```bash
diskutil eject /dev/disk2
```
(Check the disk number with `diskutil list` first — look for the one matching your microSD size)

---

## First Boot

1. Pop the microSD into the Pi (slot on the underside, metal contacts facing up, clicks in gently)
2. Assemble case + active cooler if not done
3. Connect **ethernet cable** from Pi to your router/modem
4. Plug in **USB-C power** — the Pi boots automatically
5. Wait ~90 seconds

---

## Connect via SSH

From your Mac:
```bash
ssh yourusername@raspberrypi.local
```

> **Default hostname is `raspberrypi`** when using the pre-loaded OS. You can change it after connecting (see below).
>
> **If `.local` doesn't resolve**, find the Pi's IP from your router's admin page, then: `ssh yourusername@<ip-address>`

Accept the fingerprint prompt, type your password (characters won't show — that's normal), hit enter.

---

## Post-Boot Configuration

### Set hostname
```bash
sudo hostnamectl set-hostname mypi
echo "127.0.1.1 mypi" | sudo tee -a /etc/hosts
```

### Ensure mDNS works (so `mypi.local` resolves on the network)
```bash
sudo apt install -y avahi-daemon
sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon
```

You may need to open a **new Terminal window** on your Mac for the new hostname to resolve.

### Update the system
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js 20
The OS ships with Node 18, but many tools (like Vite) require 20+:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
node -v   # should show 20.x
```

### Install common tools
```bash
sudo apt install -y build-essential python3 nginx git
sudo npm install -g pm2
```

### Set up SSH key auth (recommended)
Password auth works but key-based is easier for repeated access and for tools like `scp`.

On your Mac:
```bash
# Generate a key (if you don't already have ~/.ssh/id_ed25519)
ssh-keygen -t ed25519

# Copy it to the Pi
ssh-copy-id yourusername@mypi.local
```

> **Important**: Pi OS Trixie (Debian 13) disables RSA keys (`ssh-rsa`). Use **ed25519** keys. If `ssh-copy-id` doesn't work, manually append your public key:
> ```bash
> # On your Mac, show the key:
> cat ~/.ssh/id_ed25519.pub
>
> # On the Pi, add it:
> mkdir -p ~/.ssh && chmod 700 ~/.ssh
> echo '<paste the key>' >> ~/.ssh/authorized_keys
> chmod 600 ~/.ssh/authorized_keys
> ```

---

## You're Done

The Pi is ready. From here, follow your project's deployment guide for app-specific setup.

---

## Troubleshooting

**`hostname.local` doesn't resolve**
- Open a new Terminal window (macOS caches DNS failures)
- Restart avahi: `sudo systemctl restart avahi-daemon` (on the Pi)
- Use the IP instead: `ssh yourusername@<ip>` (find IP with `hostname -I` on the Pi)

**Password prompt doesn't appear (cursor just sits there)**
- You might be typing into a hidden password prompt. Type the password and hit enter — characters won't display.
- If truly hanging, the Pi might not be reachable. Check ethernet connection and try pinging the IP.

**`openssl passwd -6` doesn't work**
- Older macOS versions don't support `-6` or `-5`. Use `-1` instead. It's less secure but fine for a local network device.

**Raspberry Pi Imager fails to install**
- Often a Java dependency issue. Skip the Imager and use Option B (pre-loaded SD card with manual config files).
