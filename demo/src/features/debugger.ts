import { onExtHostInitialized, registerExtension } from 'vscode/extensions'
import * as vscode from 'vscode'

await new Promise<void>(resolve => onExtHostInitialized(resolve))

const debuggerExtension = {
  name: 'debugger',
  publisher: 'codingame',
  version: '1.0.0',
  engines: {
    vscode: '*'
  },
  contributes: {
    debuggers: [{
      type: 'javascript',
      label: 'Test',
      languages: ['javascript']
    }],
    breakpoints: [{
      language: 'javascript'
    }]
  }
}

const { api: debuggerVscodeApi } = registerExtension(debuggerExtension)

class WebsocketDebugAdapter implements vscode.DebugAdapter {
  constructor (private websocket: WebSocket) {
    websocket.onmessage = (message) => {
      this._onDidSendMessage.fire(JSON.parse(message.data))
    }
  }

  _onDidSendMessage = new debuggerVscodeApi.EventEmitter<vscode.DebugProtocolMessage>()
  onDidSendMessage = this._onDidSendMessage.event

  handleMessage (message: vscode.DebugProtocolMessage): void {
    this.websocket.send(JSON.stringify(message))
  }

  dispose () {
    this.websocket.close()
  }
}

debuggerVscodeApi.debug.registerDebugAdapterDescriptorFactory('javascript', {
  async createDebugAdapterDescriptor () {
    const websocket = new WebSocket('ws://localhost:5555')

    await new Promise((resolve, reject) => {
      websocket.onopen = resolve
      websocket.onerror = () => reject(new Error('Unable to connect to debugger server. Run `npm run start:debugServer`'))
    })

    websocket.send(JSON.stringify({
      main: '/tmp/test.js',
      files: {
        '/tmp/test.js': new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file('/tmp/test.js')))
      }
    }))

    const adapter = new WebsocketDebugAdapter(websocket)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter.onDidSendMessage((message: any) => {
      if (message.type === 'event' && message.event === 'output') {
        // eslint-disable-next-line no-console
        console.log('OUTPUT', message.body.output)
      }
    })
    return new debuggerVscodeApi.DebugAdapterInlineImplementation(adapter)
  }
})
