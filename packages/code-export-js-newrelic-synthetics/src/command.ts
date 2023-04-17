import {
  codeExport as exporter,
  ExportFlexCommandShape,
  PrebuildEmitter,
  ProcessedCommandEmitter,
} from 'side-code-export'
import { CommandShape } from '@seleniumhq/side-model'
import location from './location'

const emitWaitForWindow = async () => {
  const generateMethodDeclaration = (name: string) => {
    return {
      body: `async function ${name}(timeout = 2) {`,
      terminatingKeyword: '}',
    }
  }
  const commands = [
    { level: 0, statement: 'await driver.sleep(timeout)' },
    { level: 0, statement: 'const handlesThen = vars["windowHandles"]' },
    {
      level: 0,
      statement: 'const handlesNow = await driver.getAllWindowHandles()',
    },
    { level: 0, statement: 'if (handlesNow.length > handlesThen.length) {' },
    {
      level: 1,
      statement:
        'return handlesNow.find(handle => (!handlesThen.includes(handle)))',
    },
    { level: 0, statement: '}' },
    {
      level: 0,
      statement: 'throw new Error("New window did not appear before timeout")',
    },
  ]
  return Promise.resolve({
    name: 'waitForWindow',
    commands,
    generateMethodDeclaration,
  })
}

const emitNewWindowHandling = async (
  command: CommandShape,
  emittedCommand: ExportFlexCommandShape
) =>
  Promise.resolve(
    `vars["windowHandles"] = await driver.getAllWindowHandles()\n${await emittedCommand}\nvars["${
      command.windowHandleName
    }"] = await waitForWindow(${command.windowTimeout})`
  )

const emitAssert = async (varName: string, value: string) =>
  Promise.resolve(`assert(vars["${varName}"].toString() == "${value}")`)

const emitAssertAlert = async (alertText: string) =>
  Promise.resolve(
    `assert(await $webDriver.switchTo().alert().getText() == "${alertText}")`
  )

const emitAnswerOnNextPrompt = async (answer: string) => {
  const commands = [
    {
      level: 0,
      statement: 'const alert = await $webDriver.switchTo().alert()',
    },
    { level: 0, statement: `await alert().sendKeys("${answer}")` },
    { level: 0, statement: 'await alert().accept()' },
  ]
  return Promise.resolve({ commands })
}

const emitCheck = async (locator: string) => {
  const commands = [
    {
      level: 0,
      statement: `const element = await $webDriver.wait(until.elementLocated(${await location.emit(
        locator
      )}))`,
    },
    {
      level: 0,
      statement: `if(!await element.isSelected()) await element.click()`,
    },
  ]

  return Promise.resolve({ commands })
}

const emitChooseCancelOnNextConfirmation = async () =>
  Promise.resolve(`await $webDriver.switchTo().alert().dismiss()`)

const emitChooseOkOnNextConfirmation = async () =>
  Promise.resolve(`await $webDriver.switchTo().alert().accept()`)

const emitClick = async (target: string) =>
  Promise.resolve(
    `await $webDriver.wait(until.elementLocated(${await location.emit(
      target
    )})).click()`
  )

const emitClose = async () => Promise.resolve(`await $webDriver.close()`)

const emitDragAndDrop = async (dragged: string, dropped: string) => {
  const commands = [
    {
      level: 0,
      statement: `const dragged = await $webDriver.wait(until.elementLocated(${await location.emit(
        dragged
      )}))`,
    },
    {
      level: 0,
      statement: `const dropped = await $webDriver.wait(until.elementLocated(${await location.emit(
        dropped
      )}))`,
    },
    {
      level: 0,
      statement:
        'await $webDriver.actions().dragAndDrop(dragged, dropped).perform()',
    },
  ]
  return Promise.resolve({ commands })
}

const emitEcho = (message: string) => {
  const _message = message.startsWith('vars[') ? message : `"${message}"`
  return Promise.resolve(`console.log(${_message})`)
}

const emitOpen = async (target: string) => {
  const url = /^(file|http|https):\/\//.test(target)
    ? `"${target}"`
    : // @ts-expect-error globals yuck
      `"${global.baseUrl}${target}"`
  return Promise.resolve(`await $webDriver.get(${url})`)
}

const generateSendKeysInput = (value: string | string[]) => {
  if (typeof value === 'object') {
    return value
      .map((s) => {
        if (s.startsWith('vars[')) {
          return s
        } else if (s.startsWith('Key[')) {
          const key = s.match(/\['(.*)'\]/)?.[1]
          return `Key.${key}`
        } else {
          return `"${s}"`
        }
      })
      .join(', ')
  } else {
    if (value.startsWith('vars[')) {
      return value
    } else {
      return `"${value}"`
    }
  }
}

const emitType = async (target: string, value: string) => {
  return Promise.resolve(
    `await $webDriver.wait(until.elementLocated(${await location.emit(
      target
    )})).sendKeys(${generateSendKeysInput(value)})`
  )
}

const variableLookup = (varName: string) => {
  return `vars["${varName}"]`
}

function emit(command: CommandShape) {
  return exporter.emit.command(command, emitters[command.command], {
    variableLookup,
    emitNewWindowHandling,
  })
}

const skip = async () => Promise.resolve('')

export const emitters: Record<string, ProcessedCommandEmitter> = {
  assert: emitAssert,
  assertAlert: emitAssertAlert,
  check: emitCheck,
  chooseCancelOnNextConfirmation: skip,
  chooseCancelOnNextPrompt: skip,
  chooseOkOnNextConfirmation: skip,
  type: emitType,
  open: emitOpen,
  click: emitClick,
  clickAt: emitClick,
  close: emitClose,
  debugger: skip,
  dragAndDropToObject: emitDragAndDrop,
  echo: emitEcho,
  webdriverAnswerOnVisiblePrompt: emitAnswerOnNextPrompt,
  webdriverChooseCancelOnVisibleConfirmation:
    emitChooseCancelOnNextConfirmation,
  webdriverChooseOkOnVisibleConfirmation: emitChooseOkOnNextConfirmation,
}

exporter.register.preprocessors(emitters)

function register(command: string, emitter: PrebuildEmitter) {
  exporter.register.emitter({ command, emitter, emitters })
}

export default {
  emit,
  emitters,
  extras: { emitNewWindowHandling, emitWaitForWindow },
  register,
}
