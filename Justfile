set dotenv-load := true
export HOSTNAME:="local.kurtbuilds.com"

#################
## Certificate ##
#################
help:
  @just --list --unsorted

bootstrap:
    pnpm install

# Create root certificate
root:
    # Provide 1234 as a password.
    openssl genrsa -des3 -out myCA.key 2048
    # Generate root certificate.
    openssl req -x509 -new -nodes -key myCA.key -sha256 -days 1825 -out myCA.pem

# Add root to the Keychain
add-root:
    sudo security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" myCA.pem
    # You can also add it to iOS: https://deliciousbrains.com/ssl-certificate-authority-for-local-https-development/

# Create the website certificate
cert:
    openssl genrsa -out $HOSTNAME.key 2048
    openssl req -new -key $HOSTNAME.key -out $HOSTNAME.csr
    openssl x509 -req -in $HOSTNAME.csr -CA myCA.pem -CAkey myCA.key -CAcreateserial -out $HOSTNAME.crt -days 825 -sha256 -extfile $HOSTNAME.ext
    mkdir cert/
    cp $HOSTNAME{.crt,.key} cert/
    # $HOSTNAME.key is the private key.
    # $HOSTNAME.csr is the CSR.
    # $HOSTNAME.crt is the signed certificate.
    
config:
    #!/bin/bash
    cat <<EOF > $HOSTNAME.ext
    authorityKeyIdentifier=keyid,issuer
    basicConstraints=CA:FALSE
    keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
    subjectAltName = @alt_names

    [alt_names]
    DNS.1 = $HOSTNAME
    EOF

#################
## Node Server ##
#################

export PATH := "./node_modules/.bin:" + env_var('PATH')

run:
    watchexec -e ts -r -- node --trace-warnings --unhandled-rejections=strict -r esbuild-register src/main.ts
alias r := run

release:
    esbuild --platform=node src/main.ts --bundle --outfile=build/index.js

@install: release
    echo "#!/usr/bin/env node" | sudo tee /usr/local/bin/http
    cat build/index.js | sudo tee -a /usr/local/bin/http
    sudo chmod +x /usr/local/bin/http

    echo "#!/bin/sh" | sudo tee /usr/local/bin/https
    echo "HTTPS=true http \"$""@\"" | sudo tee -a /usr/local/bin/https
    sudo chmod +x /usr/local/bin/https
    echo Installed to /usr/local/bin/http
    echo Installed to /usr/local/bin/https
