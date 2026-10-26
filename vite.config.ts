import {defineConfig} from 'vite';
import {devProxy} from './scripts/dev-proxy.mjs';
export default defineConfig({server:{host:'127.0.0.1',port:Number(process.env.DEV_PORT||5173),strictPort:true,proxy:{'/api':devProxy(Number(process.env.DEV_API_PORT||4312),Number(process.env.DEV_PORT||5173))}}});
