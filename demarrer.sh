#!/usr/bin/env bash
# Pour Ubuntu/Linux : chmod +x demarrer.sh && ./demarrer.sh
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Installe Node.js 22 (https://nodejs.org) puis relance."; exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')/" .env
  echo "Fichier .env cree avec un secret de session aleatoire."
fi
if grep -qE '^ADMIN_PASSWORD=$' .env; then
  echo "Ecris ton mot de passe admin (8 caracteres min) apres ADMIN_PASSWORD= dans .env (nano .env), puis relance."
  exit 1
fi
npm install || exit 1
npm start
