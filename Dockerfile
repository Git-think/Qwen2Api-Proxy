FROM node:lts-alpine

# 全局安装PM2
RUN npm install -g pm2

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 构建前端应用
RUN cd public && npm install && npm run build

# 删除前端不必要文件
RUN rm -rf public/src public/node_modules public/package*.json

# 设置权限
RUN chmod 777 /app

# 创建日志目录
RUN mkdir -p logs

# 暴露端口（通过环境变量SERVICE_PORT控制）
EXPOSE 3000

# 使用PM2启动应用，并保持容器运行
CMD ["npm", "start"]