run = "npm start"
entrypoint = "Falcon.js"

[nix]
channel = "stable-23_11"

[deployment]
run = ["sh", "-c", "npm start"]
