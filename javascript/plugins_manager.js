"use strict"

const fs = require("fs")

class PluginsManager {

    constructor (path, appLogger, appVersion) {

        this.path = `${__dirname.replace(/\\/g,"/").replace("/javascript", "")}/`.replace("/resources/app/resources/app", "/resources/app")
        this.appVersion = appVersion
        this.appLogger = appLogger
        this.plugins = []
        this.selectedPlugin = undefined
        this.hasRunPostStartPlugins = false
        this.changesToApply = {
            ticked: [],
            unticked: []
        }
        this.resetModules()


        this.scanPlugins()
        this.savePlugins()
        this.appLogger.log(`${this.path}/plugins`)
        if (fs.existsSync(`${this.path}/plugins`)) {
            fs.watch(`${this.path}/plugins`, {recursive: false, persistent: true}, (eventType, filename) => {
                this.scanPlugins()
                this.updateUI()
                this.savePlugins()
            })
        }

        plugins_moveUpBtn.addEventListener("click", () => {

            if (!this.selectedPlugin || this.selectedPlugin[1]==0) return

            const plugin = this.plugins.splice(this.selectedPlugin[1], 1)[0]
            this.plugins.splice(this.selectedPlugin[1]-1, 0, plugin)
            this.selectedPlugin[1] -= 1
            this.updateUI()
            plugins_applyBtn.disabled = false
        })

        plugins_moveDownBtn.addEventListener("click", () => {

            if (!this.selectedPlugin || this.selectedPlugin[1]==this.plugins.length-1) return

            const plugin = this.plugins.splice(this.selectedPlugin[1], 1)[0]
            this.plugins.splice(this.selectedPlugin[1]+1, 0, plugin)
            this.selectedPlugin[1] += 1
            this.updateUI()
            plugins_applyBtn.disabled = false
        })

        plugins_applyBtn.addEventListener("click", () => this.apply())
        plugins_main.addEventListener("click", (e) => {
            if (e.target == plugins_main) {
                this.selectedPlugin = undefined
                this.updateUI()
            }
        })

        window.pluginsManager = this
        this.loadModules()
    }

    resetModules () {
        this.setupModules = new Set()
        this.teardownModules = {}
        this.pluginsModules = {
            "start": {
                "pre": [],
                "post": []
            },
            "keep-sample": {
                "pre": [],
                "mid": [],
                "post": []
            },
            "batch-stop": {
                "post": []
            },
            "generate-voice": {
                "pre": []
            }
        }
        pluginsCSS.innerHTML = ""
    }

    scanPlugins () {

        const plugins = []

        try {
            const pluginIDs = fs.readdirSync(`${this.path}/plugins`)
            pluginIDs.forEach(pluginId => {
                try {
                    const pluginData = JSON.parse(fs.readFileSync(`${this.path}/plugins/${pluginId}/plugin.json`))

                    const minVersionOk = window.checkVersionRequirements(pluginData["min-app-version"], this.appVersion)
                    const maxVersionOk = window.checkVersionRequirements(pluginData["max-app-version"], this.appVersion, true)

                    plugins.push([pluginId, pluginData, false, minVersionOk, maxVersionOk])

                } catch (e) {
                    this.appLogger.log(`${window.i18n.ERR_LOADING_PLUGIN} ${pluginId}: ${e}`)
                }
            })


        } catch (e) {
            console.log(e)
        }

        const orderedPlugins = []

        // Order the found known plugins
        window.userSettings.plugins.loadOrder.split(",").forEach(pluginId => {
            for (let i=0; i<plugins.length; i++) {
                if (pluginId.replace("*", "")==plugins[i][0]) {
                    plugins[i][2] = pluginId.includes("*")
                    orderedPlugins.push(plugins[i])
                    plugins.splice(i,1)
                    break
                }
            }
        })

        // Add any remaining (new) plugins at the bottom of the list
        plugins.forEach(p => orderedPlugins.push(p))
        this.plugins = orderedPlugins
    }

    updateUI () {

        pluginsRecordsContainer.innerHTML = ""

        this.plugins.forEach(([pluginId, pluginData, isEnabled, minVersionOk, maxVersionOk], pi) => {
            const record = createElem("div")
            const enabledCkbx = createElem("input", {type: "checkbox"})
            enabledCkbx.checked = isEnabled
            record.appendChild(createElem("div", enabledCkbx))
            record.appendChild(createElem("div", `${pi}`))

            const pluginNameElem = createElem("div", pluginData["plugin-name"])
            pluginNameElem.title = pluginData["plugin-name"]
            record.appendChild(pluginNameElem)

            const pluginAuthorElem = createElem("div", pluginData["author"]||"")
            pluginAuthorElem.title = pluginData["author"]||""
            record.appendChild(pluginAuthorElem)

            const endorseButtonContainer = createElem("div")
            record.appendChild(endorseButtonContainer)
            if (pluginData["nexus-link"] && window.nexusState.key) {

                if (window.nexusState.key) {
                    window.nexus_getData(`${pluginData["nexus-link"].split(".com/")[1]}.json`).then(repoInfo => {
                        const endorseButton = createElem("button.smallButton", "Endorse")
                        const gameId = repoInfo.game_id
                        const nexusRepoId = repoInfo.mod_id

                        if (repoInfo.endorsement.endorse_status=="Endorsed") {
                            window.endorsedRepos.add(`plugin:${pluginId}`)
                            endorseButton.innerHTML = "Unendorse"
                            endorseButton.style.background = "none"
                            endorseButton.style.border = `2px solid #${window.currentGame ? currentGame[1] : "ccc"}`
                        } else {
                            endorseButton.style.setProperty("background-color", `#${window.currentGame ? currentGame[1] : "ccc"}`, "important")
                        }

                        endorseButtonContainer.appendChild(endorseButton)
                        endorseButton.addEventListener("click", async () => {
                            let response
                            if (window.endorsedRepos.has(`plugin:${pluginId}`)) {
                                response = await window.nexus_getData(`${gameId}/mods/${nexusRepoId}/abstain.json`, {
                                    game_domain_name: gameId,
                                    id: nexusRepoId,
                                    version: repoInfo.version
                                }, "POST")
                            } else {
                                response = await window.nexus_getData(`${gameId}/mods/${nexusRepoId}/endorse.json`, {
                                    game_domain_name: gameId,
                                    id: nexusRepoId,
                                    version: repoInfo.version
                                }, "POST")
                            }
                            if (response && response.message && response.status=="Error") {
                                if (response.message=="NOT_DOWNLOADED_MOD") {
                                    response.message = "You need to first download something from this repo to be able to endorse it."
                                } else if (response.message=="TOO_SOON_AFTER_DOWNLOAD") {
                                    response.message = "Nexus requires you to wait at least 15 mins (at the time of writing) before you can endorse."
                                } else if (response.message=="IS_OWN_MOD") {
                                    response.message = "Nexus does not allow you to rate your own content."
                                }

                                window.errorModal(response.message)
                            } else {

                                if (window.endorsedRepos.has(`plugin:${pluginId}`)) {
                                    window.endorsedRepos.delete(`plugin:${pluginId}`)
                                } else {
                                    window.endorsedRepos.add(`plugin:${pluginId}`)
                                }
                                this.updateUI()
                            }
                        })
                    })
                }
            }


            const hasBackendScript = !!Object.keys(pluginData["back-end-hooks"]).find(key => {
                return (key=="custom-event" && pluginData["back-end-hooks"]["custom-event"]["file"]) ||
                (pluginData["back-end-hooks"][key]["pre"] && pluginData["back-end-hooks"][key]["pre"]["file"]) ||
                (pluginData["back-end-hooks"][key]["mid"] && pluginData["back-end-hooks"][key]["mid"]["file"]) ||
                (pluginData["back-end-hooks"][key]["post"] && pluginData["back-end-hooks"][key]["post"]["file"])
            })
            const hasFrontendScript = !!pluginData["front-end-hooks"]
            const type =  hasFrontendScript && hasBackendScript ? "Both": (!hasFrontendScript && !hasBackendScript ? "None" : (hasFrontendScript ? "Front" : "Back"))

            record.appendChild(createElem("div", pluginData["plugin-version"]))
            record.appendChild(createElem("div", type))
            // Min app version requirement
            const minAppVersionElem = createElem("div", pluginData["min-app-version"])
            record.appendChild(minAppVersionElem)
            if (pluginData["min-app-version"] && !minVersionOk) {
                minAppVersionElem.style.color = "red"
                enabledCkbx.checked = false
                enabledCkbx.disabled = true
            }

            // Max app version requirement
            const maxAppVersionElem = createElem("div", pluginData["max-app-version"])
            record.appendChild(maxAppVersionElem)
            if (pluginData["max-app-version"] && !maxVersionOk) {
                maxAppVersionElem.style.color = "red"
                enabledCkbx.checked = false
                enabledCkbx.disabled = true
            }

            const shortDescriptionElem = createElem("div", pluginData["plugin-short-description"])
            shortDescriptionElem.title = pluginData["plugin-short-description"]
            record.appendChild(shortDescriptionElem)

            const pluginIdElem = createElem("div", pluginId)
            pluginIdElem.title = pluginId
            record.appendChild(pluginIdElem)

            pluginsRecordsContainer.appendChild(record)

            enabledCkbx.addEventListener("click", () => {
                this.plugins[pi][2] = enabledCkbx.checked
                plugins_applyBtn.disabled = false
            })

            record.addEventListener("click", (e) => {

                if (e.target==enabledCkbx || e.target.nodeName=="BUTTON") {
                    return
                }

                if (this.selectedPlugin) {
                    this.selectedPlugin[0].style.background = "none"
                    Array.from(this.selectedPlugin[0].children).forEach(child => child.style.color = "white")
                }

                this.selectedPlugin = [record, pi, pluginData]
                this.selectedPlugin[0].style.background = "white"
                Array.from(this.selectedPlugin[0].children).forEach(child => child.style.color = "black")

                plugins_moveUpBtn.disabled = false
                plugins_moveDownBtn.disabled = false

            })
            if (this.selectedPlugin && pi==this.selectedPlugin[1]) {
                this.selectedPlugin = [record, pi, pluginData]
                this.selectedPlugin[0].style.background = "white"
                Array.from(this.selectedPlugin[0].children).forEach(child => child.style.color = "black")
            }

        })
    }

    savePlugins () {
        window.userSettings.plugins.loadOrder = this.plugins.map(([pluginId, pluginData, isEnabled]) => `${isEnabled?"*":""}${pluginId}`).join(",")
        saveUserSettings()
        fs.writeFileSync(`./plugins.txt`, window.userSettings.plugins.loadOrder.replace(/,/g, "\n"))
    }

    apply () {

        const enabledPlugins = this.plugins.filter(([pluginId, pluginData, isEnabled]) => isEnabled).map(([pluginId, pluginData, isEnabled]) => pluginId)
        const newPlugins = enabledPlugins.filter(pluginId => !window.userSettings.plugins.loadOrder.includes(`*${pluginId}`))
        const removedPlugins = window.userSettings.plugins.loadOrder.split(",").filter(pluginId => pluginId.startsWith("*") && !enabledPlugins.includes(pluginId.slice(1, 100000)) ).map(pluginId => pluginId.slice(1, 100000))

        removedPlugins.forEach(pluginId => {
            if (this.teardownModules[pluginId]) {
                this.teardownModules[pluginId].forEach(func => func())
            }
        })

        const pluginLoadStatus = this.loadModules()
        if (pluginLoadStatus) {
            window.errorModal(`${window.i18n.FAILED_INIT_FOLLOWING} ${window.i18n.PLUGIN.toLowerCase()}: ${pluginLoadStatus}`)
            return
        }
        this.savePlugins()
        this.resetModules()
        plugins_applyBtn.disabled = true

        doFetch(`http://localhost:8008/refreshPlugins`, {
            method: "Post",
            body: "{}"
        }).then(r=>r.text()).then(status => {

            const plugins = status.split(",")
            const successful = plugins.filter(p => p=="OK")
            const failed = plugins.filter(p => p!="OK")

            let message = `${window.i18n.SUCCESSFULLY_INITIALIZED} ${successful.length} ${successful.length>1||successful.length==0?window.i18n.PLUGINS:window.i18n.PLUGIN}.`
            if (failed.length) {
                if (successful.length==0) {
                    message = ""
                }
                message += ` ${window.i18n.FAILED_INIT_FOLLOWING} ${failed.length>1?window.i18n.PLUGINS:window.i18n.PLUGIN}: <br>${failed.join("<br>")} <br><br>${window.i18n.CHECK_SERVERLOG}`
            }

            if (!status.length || successful.length==0 && failed.length==0) {
                message = window.i18n.SUCC_NO_ACTIVE_PLUGINS
            }

            const restartRequired = newPlugins.map(newPluginId => this.plugins.find(([pluginId, pluginData, isEnabled]) => pluginId==newPluginId))
                                              .filter(([pluginId, pluginData, isEnabled]) => !!pluginData["install-requires-restart"]).length +
                                    removedPlugins.map(removedPluginId => this.plugins.find(([pluginId, pluginData, isEnabled]) => pluginId==removedPluginId))
                                              .filter(([pluginId, pluginData, isEnabled]) => !!pluginData["uninstall-requires-restart"]).length
            if (restartRequired) {
                message += `<br><br> ${window.i18n.APP_RESTART_NEEDED}`
            }

            // Don't use window.errorModal, otherwise you get the error sound
            createModal("error", message)
        })
    }


    loadModules () {
        for (let pi=0; pi<this.plugins.length; pi++) {
            const [pluginId, pluginData, enabled] = this.plugins[pi]
            if (!enabled) continue
            let failed

            failed = this.loadModuleFns(pluginId, pluginData, "start", "pre")
            if (failed) return `${pluginId}->start->pre<br><br>${failed}`

            failed = this.loadModuleFns(pluginId, pluginData, "start", "post")
            if (failed) return `${pluginId}->start->post<br><br>${failed}`

            this.loadModuleFns(pluginId, pluginData, "keep-sample", "pre")
            if (failed) return `${pluginId}->keep-sample->pre<br><br>${failed}`

            this.loadModuleFns(pluginId, pluginData, "keep-sample", "mid")
            if (failed) return `${pluginId}->keep-sample->mid<br><br>${failed}`

            this.loadModuleFns(pluginId, pluginData, "keep-sample", "post")
            if (failed) return `${pluginId}->keep-sample->post<br><br>${failed}`

            this.loadModuleFns(pluginId, pluginData, "generate-voice", "pre")
            if (failed) return `${pluginId}->generate-voice->pre<br><br>${failed}`

            this.loadModuleFns(pluginId, pluginData, "batch-stop", "post")
            if (failed) return `${pluginId}->batch-stop->post<br><br>${failed}`


            if (Object.keys(pluginData).includes("front-end-style-files") && pluginData["front-end-style-files"].length) {
                pluginData["front-end-style-files"].forEach(styleFile => {
                    try {
                        if (styleFile.endsWith(".css")) {
                            const styleData = fs.readFileSync(`${this.path}/plugins/${pluginId}/${styleFile}`)
                            pluginsCSS.innerHTML += styleData
                        }
                    } catch (e) {
                        window.appLogger.log(`${window.i18n.ERR_LOADING_CSS} ${pluginId}: ${e}`)
                    }
                })
            }
        }
    }

    loadModuleFns (pluginId, pluginData, task, hookTime) {
        try {
            if (Object.keys(pluginData).includes("front-end-hooks") && Object.keys(pluginData["front-end-hooks"]).includes(task) && Object.keys(pluginData["front-end-hooks"][task]).includes(hookTime) ) {

                const file = pluginData["front-end-hooks"][task][hookTime]["file"]
                const functionName = pluginData["front-end-hooks"][task][hookTime]["function"]

                if (!file.endsWith(".js")) {
                    window.appLogger.log(`[${window.i18n.PLUGIN}: ${pluginId}]: ${window.i18n.CANT_IMPORT_FILE_FOR_HOOK_TASK_ENTRYPOINT.replace("_1", file).replace("_2", hookTime).replace("_3", task)}: ${window.i18n.ONLY_JS}`)
                    return
                }

                if (file && functionName) {
                    const module = require(`${this.path}/plugins/${pluginId}/${file}`)

                    if (module.teardown) {
                        if (!Object.keys(this.teardownModules).includes(pluginId)) {
                            this.teardownModules[pluginId] = []
                        }
                        this.teardownModules[pluginId].push(module.teardown)
                    }

                    if (module.setup && !this.setupModules.has(`${pluginId}/${file}`)) {
                        window.appLogger.setPrefix(pluginId)
                        module.setup(window)
                        window.appLogger.setPrefix("")
                        this.setupModules.add(`${pluginId}/${file}`)
                    }

                    this.pluginsModules[task][hookTime].push([pluginId, module[functionName]])
                }
            }
        } catch (e) {
            console.log(`${window.i18n.ERR_LOADING_PLUGIN} ${pluginId}->${task}->${hookTime}: ` + e.stack)
            window.appLogger.log(`${window.i18n.ERR_LOADING_PLUGIN} ${pluginId}->${task}->${hookTime}: ` + e)
            return e.stack
        }

    }

    runPlugins (pList, event, data) {
        if (pList.length) {
            console.log(`Running plugin for event: ${event}`)
        }
        pList.forEach(([pluginId, pluginFn]) => {
            try {
                window.appLogger.setPrefix(pluginId)
                pluginFn(window, data)
                window.appLogger.setPrefix("")

            } catch (e) {
                console.log(e, pluginFn)
                window.appLogger.log(`[${window.i18n.PLUGIN_RUN_ERROR} "${event}": ${pluginId}]: ${e}`)
            }
        })
    }


    registerINIFile (pluginId, settingsKey, filePath) {

        if (!pluginId || !settingsKey || !filePath) {
            return self.log(`You must provide the following to register an ini file: pluginId, settingsKey, filePath`)
        }

        if (fs.existsSync(filePath)) {

            if (document.querySelectorAll(`.${pluginId}_plugin_setting`).length) {
                return
            }

            const IniSettings = {}
            const iniFileData = fs.readFileSync(filePath, "utf8").split("\n")

            const hr = createElem(`hr.${pluginId}_plugin_setting`)
            settingsOptionsContainer.appendChild(hr)
            settingsOptionsContainer.appendChild(createElem("div.centeredSettingsSectionPlugins", createElem("div", window.i18n.SETTINGS_FOR_PLUGIN.replace("_1", pluginId)) ))

            iniFileData.forEach(keyVal => {
                if (!keyVal.trim().length) {
                    return
                }
                let comment = keyVal.includes("#") ? keyVal.split("#")[1].trim() : undefined
                keyVal = keyVal.split("#")[0].trim()
                const key = keyVal.split("=")[0].trim()
                const val = keyVal.split("=")[1].trim()
                IniSettings[key.toLowerCase()] = val

                const labelText = key[0].toUpperCase() + key.substring(1)
                let label, input

                if (comment && comment.includes("{") && comment.includes(":")) {

                    const optionsList = comment.split("{")[1].split("}")[0].split(";").map(kv => {
                        return [kv.split(":")[0], kv.split(":")[1]]
                    })
                    const optionElems = optionsList.map(data => {
                        const opt = createElem("option", {value: data[1]})
                        opt.innerHTML = data[0]
                        return opt
                    })

                    comment = comment.split("}").reverse()[0].trim()
                    label = createElem("div", labelText.replace(/_/g, " ") + (comment ? `<br>(${comment})` : ""))

                    input = createElem("select", {name: key, comment: comment})
                    optionElems.forEach(option => {
                        input.appendChild(option)
                    })
                    input.value = val

                } else {
                    label = createElem("div", labelText.replace(/_/g, " ") + (comment ? `<br>(${comment})` : ""))
                    const inputType = ["true","false"].includes(val.toLowerCase()) ? "checkbox" : "text"
                    input = createElem("input", {
                        type: inputType, name: key, comment: comment
                    })
                    if (inputType=="checkbox") {
                        input.checked = val.toLowerCase() == "true"
                    } else {
                        input.value = val
                    }
                }


                input.addEventListener("change", () => {
                    const outputIni = []
                    settingsOptionsContainer.querySelectorAll(`.${pluginId}_plugin_setting>div>input, .${pluginId}_plugin_setting>div>select`).forEach(input => {
                        if (input.tagName=="SELECT") {
                            const select = input
                            const optionsList = Array.from(select.querySelectorAll("option")).map(option => {
                                return [option.innerHTML, option.value]
                            })
                            const optionsListString = `{${optionsList.map(kv => kv.join(":")).join(";")}}`

                            outputIni.push(`${select.name.toLowerCase()}=${select.value} # ${optionsListString} ${select.getAttribute("comment")!="undefined" ? select.getAttribute("comment") : ""}`)
                            IniSettings[select.name.toLowerCase()] = select.value

                        } else {
                            const value = input.type=="checkbox" ? (input.checked ? "true" : "false") : input.value
                            outputIni.push(`${input.name.toLowerCase()}=${value}${input.getAttribute("comment")!="undefined" ? " # "+input.getAttribute("comment") : ""}`)
                            IniSettings[input.name.toLowerCase()] = value
                        }
                    })

                    fs.writeFileSync(filePath, outputIni.join("\n"), "utf8")
                    window.pluginsContext[settingsKey] = IniSettings
                })

                settingsOptionsContainer.appendChild(createElem(`div.${pluginId}_plugin_setting`, [label, createElem("div", input)]))
            })

            window.pluginsContext[settingsKey] = IniSettings



        } else {
            this.log(`Ini file does not exists here: ${filePath}`)
        }

    }

}


exports.PluginsManager = PluginsManager