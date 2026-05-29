import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本地开发时通过代理转发到各天气信源，规避浏览器 CORS 限制。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // 和风天气：/proxy/qweather/* -> https://devapi.qweather.com/*
      '/proxy/qweather': {
        target: 'https://devapi.qweather.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/qweather/, ''),
      },
      // 彩云天气：/proxy/caiyun/* -> https://api.caiyunapp.com/*
      '/proxy/caiyun': {
        target: 'https://api.caiyunapp.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/caiyun/, ''),
      },
      // 中央气象台：/proxy/nmc/* -> http://www.nmc.cn/*
      '/proxy/nmc': {
        target: 'http://www.nmc.cn',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/nmc/, ''),
      },
      // 广州市气象局：/proxy/gzqx/* -> https://www.tqyb.com.cn/*
      '/proxy/gzqx': {
        target: 'https://www.tqyb.com.cn',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/gzqx/, ''),
      },
    },
  },
})
