# Usa imagem oficial Node.js
FROM node:18

# Cria diretório de trabalho
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o restante do código
COPY . .

# Expõe a porta do webhook (ajuste se mudar a porta)
EXPOSE 3000

# Comando para iniciar o bot
CMD ["npm", "start"] 