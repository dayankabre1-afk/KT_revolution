# KT REVOLUTION — 2 articles, comptes clients, paiement à la livraison, alertes

Pile : HTML/CSS/JS · Node.js + Express · SQLite (intégré à Node 22.13+).

## Démarrage
1. Installe Node.js 22.13 ou plus récent : https://nodejs.org/en/download
2. Windows : double-clique sur `demarrer.bat` (Ubuntu : `./demarrer.sh`).
   Au premier lancement, le Bloc-notes s'ouvre : écris ton mot de passe admin après `ADMIN_PASSWORD=`
   (8 caractères minimum), enregistre, ferme.
3. Boutique : http://localhost:3000 — Espace admin : http://localhost:3000/admin

## Personnaliser (fichier .env, puis relancer)
`STORE_NAME` (nom affiché, KT REVOLUTION par défaut), `CURRENCY` (FCFA par défaut), `WHATSAPP_NUMBER` (chiffres seulement, ex. 22670000000 :
affiche le bouton WhatsApp vert).

## Clients
Ils créent un compte (prénom, nom, téléphone, adresse/quartier, ville, mot de passe) et se connectent avec
leur téléphone. Leur adresse est pré-remplie à chaque commande et ils suivent leurs commandes dans « Mon compte ».

## Alertes sur ton téléphone (gratuit, via Telegram)
1. Dans Telegram, cherche **@BotFather**, envoie `/newbot`, choisis un nom : il te donne un **token**.
2. Colle-le dans `.env` après `TELEGRAM_BOT_TOKEN=` et relance le site.
3. Ouvre ton bot dans Telegram et envoie-lui « bonjour ».
4. Dans /admin, clique sur **Lier Telegram** : tu reçois un message de test.
À chaque commande, Telegram t'envoie un message avec le client, l'adresse, les articles et le total.
Dans /admin, « Activer les alertes sonores » ajoute un son quand la page est ouverte.

## Admin
Commandes (liens appel et WhatsApp, statut), et modification de tes 2 articles (nom, description, prix, photo).
Les données sont dans `commandes.db`, jamais accessible depuis le web : sauvegarde-le régulièrement.

## Mise en ligne
Hébergement en HTTPS, mots de passe longs, `.env` jamais partagé.

## Mettre le site en ligne (lien pour tout le monde)
Il faut un hébergeur qui garde un disque persistant (la base et les photos y sont écrites) :
1. Mets le projet dans un dépôt GitHub **privé** (sans `.env`, `node_modules` ni `commandes.db`).
2. Chez l'hébergeur (ex. Railway) : nouveau projet depuis ce dépôt, ajoute un volume monté sur `/data`.
3. Variables à renseigner : `JWT_SECRET`, `ADMIN_PASSWORD`, `STORE_NAME`, `CURRENCY`, `WHATSAPP_NUMBER`,
   `TELEGRAM_BOT_TOKEN` et `DATA_DIR=/data`.
4. Génère le domaine public : c'est le lien à partager. Le site passe alors en HTTPS.

## Démo gratuite sur Render
Dépôt GitHub privé, puis Render > New > Blueprint > ton dépôt (le fichier `render.yaml` fait le reste).
Render demande `ADMIN_PASSWORD`. Sans disque (offre gratuite), les données sont effacées à chaque redémarrage :
à réserver à la démonstration. Le site se met en veille après 15 minutes sans visite.
