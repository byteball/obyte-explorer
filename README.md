# Obyte explorer backend
Backend for https://github.com/byteball/obyte-explorer-frontend


#### Installation

Install node.js 10+, clone the repository, then

1) `yarn`
2) `node migration.js`
3) set pathToDist in .env or
```bash
ln -s path/to/byte-explorer-frontend/dist/ .
```

#### Run

`node explorer.js`

### Nginx config
```text
server {
	listen 80;
	server_name localhost;

	location / {
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "upgrade";
		proxy_pass http://127.0.0.1:4000;
	}

	location ~ \.(js|ico|css) {
		root /path/to/dist;
	}
}
```

By default, the explorer will be available at http://localhost:4000
