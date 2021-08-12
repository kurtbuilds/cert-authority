export HOSTNAME:="local.kurtbuilds.com"

help:
  @just --list --unsorted

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

