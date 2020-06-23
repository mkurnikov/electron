import { EventEmitter } from 'events';
import { app, ipcMain } from 'electron';

const {
  createPowerMonitor,
  getSystemIdleState,
  getSystemIdleTime
} = process._linkedBinding('electron_browser_power_monitor');

class PowerMonitor extends EventEmitter {
  constructor () {
    super();
    // Don't start the event source until both a) the app is ready and b)
    // there's a listener registered for a powerMonitor event.
    this.once('newListener', () => {
      app.whenReady().then(() => {
        const pm = createPowerMonitor();
        pm.emit = this.emit.bind(this);

        if (process.platform === 'win32') {
          // On Windows we need to handle shutdown event coming from renderers. See
          // shutdown_blocker_win.h for more details.
          // To prevent any race conditions where multiple renderers receive
          // QUERYENDSESSION and forward the message to us, we debounce by using `once`
          // to subscribe and reattach the handler 1 second later
          ipcMain.once('ELECTRON_BROWSER_QUERYENDSESSION', function remoteQueryEndSessionHandler (event) {
            pm.emit('shutdown', event);
            setTimeout(() => {
              ipcMain.once('ELECTRON_BROWSER_QUERYENDSESSION', remoteQueryEndSessionHandler);
            }, 1000);
          });
        }

        if (process.platform === 'linux') {
          // On Linux, we inhibit shutdown in order to give the app a chance to
          // decide whether or not it wants to prevent the shutdown. We don't
          // inhibit the shutdown event unless there's a listener for it. This
          // keeps the C++ code informed about whether there are any listeners.
          pm.setListeningForShutdown(this.listenerCount('shutdown') > 0);
          this.on('newListener', (event) => {
            if (event === 'shutdown') {
              pm.setListeningForShutdown(this.listenerCount('shutdown') + 1 > 0);
            }
          });
          this.on('removeListener', (event) => {
            if (event === 'shutdown') {
              pm.setListeningForShutdown(this.listenerCount('shutdown') > 0);
            }
          });
        }
      });
    });
  }

  getSystemIdleState (idleThreshold: number) {
    return getSystemIdleState(idleThreshold);
  }

  getSystemIdleTime () {
    return getSystemIdleTime();
  }
}

module.exports = new PowerMonitor();
