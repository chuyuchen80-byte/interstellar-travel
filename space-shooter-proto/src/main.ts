// 入口文件
import { Game } from './game';

const app = document.getElementById('app')!;
const game = new Game(app);
game.start();