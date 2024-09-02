import pidusage from 'pidusage';
import diskusage from 'diskusage';
import os from 'os';
import readline from 'readline';

const clearConsole = () => {
    process.stdout.write('\x1Bc');
  };
  
  const logSystemStats = async () => {
  const pid = process.pid;
    const stats = await pidusage(pid);
    
    const diskPath = path.parse(logFilePath).base; 
    const diskStats = await diskusage.check(diskPath);
  
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
  
    clearConsole();
  
    console.log(`CPU Usage: ${stats.cpu.toFixed(2)}%`);
    console.log(`Memory Usage: ${(stats.memory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Virtual Memory Usage: ${(usedMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Disk Free Space: ${(diskStats.free / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Disk Total Space: ${(diskStats.total / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Disk Usage: ${((diskStats.total - diskStats.free) / 1024 / 1024).toFixed(2)} MB`);
  };
  
  setInterval(logSystemStats, 1000);