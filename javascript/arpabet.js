"use strict"

window.arpabetMenuState = {
    currentDict: undefined,
    dictionaries: {},
    paginationIndex: 0,
    totalPages: 0,
    clickedRecord: undefined,
    skipRefresh: false,
    hasInitialised: false
}

// window.ARPAbetSymbols = ["AA", "AE", "AH", "AO", "AW", "AX", "AXR", "AY", "B", "CH", "D", "DH", "EH", "EL", "EM", "EN", "ER", "EY", "F", "G", "HH", "IH", "IX", "IY", "JH", "K", "L", "M", "N", "NG", "OW", "P", "R", "S", "SH", "T", "TH", "UH", "UW", "UX", "V", "W", "WH", "Y", "Z", "ZH"]
// window.ARPAbetSymbols = ["AA", "AE", "AH", "AO", "AW", "AY", "B", "CH", "D", "DH", "EH", "ER", "EY", "F", "G", "HH", "IH", "IY", "JH", "K", "L", "M", "N", "NG", "OY", "P", "R", "S", "SH", "T", "TH", "UH", "UW", "V", "W", "Y", "Z", "ZH"]
window.ARPAbetSymbols = [
  'AA', 'AA0', 'AA1', 'AA2', 'AE', 'AE0', 'AE1', 'AE2', 'AH', 'AH0', 'AH1', 'AH2',
  'AO', 'AO0', 'AO1', 'AO2', 'AW', 'AW0', 'AW1', 'AW2', 'AY', 'AY0', 'AY1', 'AY2',
  'B', 'CH', 'D', 'DH', 'EH', 'EH0', 'EH1', 'EH2', 'ER', 'ER0', 'ER1', 'ER2', 'EY',
  'EY0', 'EY1', 'EY2', 'F', 'G', 'HH', 'IH', 'IH0', 'IH1', 'IH2', 'IY', 'IY0', 'IY1',
  'IY2', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW', 'OW0', 'OW1', 'OW2', 'OY', 'OY0',
  'OY1', 'OY2', 'P', 'R', 'S', 'SH', 'T', 'TH', 'UH', 'UH0', 'UH1', 'UH2', 'UW',
  'UW0', 'UW1', 'UW2', 'V', 'W', 'Y', 'Z', 'ZH'
  ,"}","{"
]

window.refreshDictionariesList = () => {
    spinnerModal(window.i18n.LOADING_DICTIONARIES)

    window.arpabetMenuState.hasInitialised = true
    return new Promise(resolve => {
        if (window.arpabetMenuState.skipRefresh) {
            resolve()
            return
        }
        window.arpabetMenuState.dictionaries = {}
        arpabet_dicts_list.innerHTML = ""

        const jsonFiles = fs.readdirSync(`${window.path}/arpabet`)


        const readFile = (fileCounter) => {

            const fname = jsonFiles[fileCounter]
            if (!fname.includes(".json")) {
                if ((fileCounter+1)<jsonFiles.length) {
                    readFile(fileCounter+1)
                } else {
                    window.arpabetRunSearch()
                    closeModal(undefined, arpabetContainer)
                    resolve()
                }
                return
            }
            const dictId = fname.replace(".json", "")

            fs.readFile(`${window.path}/arpabet/${fname}`, "utf8", (err, data) => {
                const jsonData = JSON.parse(data)

                const dictButton = createElem("button", jsonData.title)
                dictButton.title = jsonData.description
                dictButton.style.background = window.currentGame ? `#${window.currentGame.themeColourPrimary}` : "#aaa"
                arpabet_dicts_list.appendChild(dictButton)

                window.arpabetMenuState.dictionaries[dictId] = jsonData

                dictButton.addEventListener("click", ()=>handleDictClick(dictId))

                if ((fileCounter+1)<jsonFiles.length) {
                    readFile(fileCounter+1)
                } else {
                    window.arpabetRunSearch()
                    closeModal(undefined, arpabetContainer)
                    resolve()
                }
            })
        }
        readFile(0)
    })
}

window.handleDictClick = (dictId) => {

    if (window.arpabetMenuState.currentDict==dictId) {
        return
    }
    arpabet_enableall_button.disabled = false
    arpabet_disableall_button.disabled = false
    window.arpabetMenuState.currentDict = dictId
    window.arpabetMenuState.paginationIndex = 0
    window.arpabetMenuState.totalPages = 0

    arpabet_word_search_input.value = ""
    window.arpabetRunSearch()
    window.refreshDictWordList()
}

window.refreshDictWordList = () => {

    const dictId = window.arpabetMenuState.currentDict
    arpabetWordsListContainer.innerHTML = ""

    const wordKeys = Object.keys(window.arpabetMenuState.dictionaries[dictId].filteredData)
    let startIndex = window.arpabetMenuState.paginationIndex*window.userSettings.arpabet_paginationSize
    const endIndex = Math.min(startIndex+window.userSettings.arpabet_paginationSize, wordKeys.length)

    window.arpabetMenuState.totalPages = Math.ceil(wordKeys.length/window.userSettings.arpabet_paginationSize)
    arpabet_pagination_numbers.innerHTML = window.i18n.PAGINATION_X_OF_Y.replace("_1", window.arpabetMenuState.paginationIndex+1).replace("_2", window.arpabetMenuState.totalPages)

    for (let i=startIndex; i<endIndex; i++) {
        const data = window.arpabetMenuState.dictionaries[dictId].filteredData[wordKeys[i]]
        const word = wordKeys[i]

        const rowElem = createElem("div.arpabetRow")
        const ckbx = createElem("input.arpabetRowItem", {type: "checkbox"})
        ckbx.checked = data.enabled
        ckbx.style.marginTop = 0
        ckbx.addEventListener("click", () => {
            window.arpabetMenuState.dictionaries[dictId].data[wordKeys[i]].enabled = ckbx.checked
            window.arpabetMenuState.skipRefresh = true
            window.saveARPAbetDict(dictId)
            setTimeout(() => window.arpabetMenuState.skipRefresh = false, 1000)
        })

        const deleteButton = createElem("button.smallButton.arpabetRowItem", window.i18n.DELETE)
        deleteButton.style.background = window.currentGame ? `#${window.currentGame.themeColourPrimary}` : "#aaa"
        deleteButton.addEventListener("click", () => {
            window.confirmModal(window.i18n.ARPABET_CONFIRM_DELETE_WORD.replace("_1", word)).then(response => {
                if (response) {
                    delete window.arpabetMenuState.dictionaries[dictId].data[word]
                    delete window.arpabetMenuState.dictionaries[dictId].filteredData[word]
                    window.saveARPAbetDict(dictId)
                    window.refreshDictWordList()
                }
            })
        })

        const wordElem = createElem("div.arpabetRowItem", word)
        wordElem.title = word

        const arpabetElem = createElem("div.arpabetRowItem", data.arpabet)
        arpabetElem.title = data.arpabet


        rowElem.appendChild(createElem("div.arpabetRowItem", ckbx))
        rowElem.appendChild(createElem("div.arpabetRowItem", deleteButton))
        rowElem.appendChild(wordElem)
        rowElem.appendChild(arpabetElem)

        rowElem.addEventListener("click", () => {
            window.arpabetMenuState.clickedRecord = {elem: rowElem, word}
            arpabet_word_input.value = word
            arpabet_arpabet_input.value = data.arpabet
        })

        arpabetWordsListContainer.appendChild(rowElem)
    }
}

window.saveARPAbetDict = (dictId) => {

    const dataOut = {
        title: window.arpabetMenuState.dictionaries[dictId].title,
        description: window.arpabetMenuState.dictionaries[dictId].description,
        version: window.arpabetMenuState.dictionaries[dictId].version,
        author: window.arpabetMenuState.dictionaries[dictId].author,
        nexusLink: window.arpabetMenuState.dictionaries[dictId].nexusLink,
        data: window.arpabetMenuState.dictionaries[dictId].data
    }

    doFetch(`http://localhost:8008/updateARPABet`, {
        method: "Post",
        body: JSON.stringify({})
    })//.then(r => r.text()).then(r => {console.log(r)})


    fs.writeFileSync(`${window.path}/arpabet/${dictId}.json`, JSON.stringify(dataOut, null, 4))
}

arpabet_save.addEventListener("click", () => {
    const word = arpabet_word_input.value.trim().toLowerCase()
    const arpabet = arpabet_arpabet_input.value.trim().toUpperCase().replace(/\s{2,}/g, " ")

    if (!word.length || !arpabet.length) {
        return window.errorModal(window.i18n.ARPABET_ERROR_EMPTY_INPUT)
    }

    const badSymbols = arpabet.split(" ").filter(symb => !window.ARPAbetSymbols.includes(symb))
    if (badSymbols.length) {
        return window.errorModal(window.i18n.ARPABET_ERROR_BAD_SYMBOLS.replace("_1", badSymbols.join(", ")))
    }

    const wordKeys = Object.keys(window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data)

    const doTheRest_updateDict = () => {
        window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[word] = {enabled: true, arpabet: arpabet}
        window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].filteredData = window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data

        window.refreshDictWordList()
        window.saveARPAbetDict(window.arpabetMenuState.currentDict)
    }


    // Delete the old record
    if (window.arpabetMenuState.clickedRecord && window.arpabetMenuState.clickedRecord.word != word) {
        delete window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[window.arpabetMenuState.clickedRecord.word]
    }

    let wordExists = []
    Object.keys(window.arpabetMenuState.dictionaries).forEach(dictName => {
        if (dictName==window.arpabetMenuState.currentDict) {
            return
        }

        if (Object.keys(window.arpabetMenuState.dictionaries[dictName].data).includes(word)) {
            wordExists.push(dictName)
        }
    })

    if (wordExists.length) {
        window.confirmModal(window.i18n.ARPABET_CONFIRM_SAME_WORD.replace("_1", word).replace("_2", wordExists.join("<br>"))).then(response => {
            if (response) {
                doTheRest_updateDict()
            }
        })
    } else {
        doTheRest_updateDict()
    }
})

arpabetModal.addEventListener("click", (event) => {
    if (window.arpabetMenuState.clickedRecord && event.target.className!="arpabetRow"&& event.target.className!="arpabetRowItem" && ![arpabet_word_input, arpabet_arpabet_input, arpabet_save, arpabet_prev_btn, arpabet_next_btn].includes(event.target)) {
        window.arpabetMenuState.clickedRecord = undefined
        arpabet_word_input.value = ""
        arpabet_arpabet_input.value = ""
    }
})
arpabet_prev_btn.addEventListener("click", () => {
    window.arpabetMenuState.paginationIndex = Math.max(0, window.arpabetMenuState.paginationIndex-1)
    window.refreshDictWordList()
})
arpabet_next_btn.addEventListener("click", () => {
    window.arpabetMenuState.paginationIndex = Math.min(window.arpabetMenuState.totalPages-1, window.arpabetMenuState.paginationIndex+1)
    window.refreshDictWordList()
})

window.arpabetRunSearch = () => {
    if (!window.arpabetMenuState.currentDict) {
        return
    }
    window.arpabetMenuState.paginationIndex = 0
    window.arpabetMenuState.totalPages = 0

    const query = arpabet_word_search_input.value.trim().toLowerCase()

    if (!query.length) {
        if (arpabet_search_only_enabled.checked) {
            const filteredKeys = Object.keys(window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data).filter(key => window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[key].enabled)
            window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].filteredData = {}
            filteredKeys.forEach(key => {
                window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].filteredData[key] = window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[key]
            })
        } else {
            window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].filteredData = window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data
        }
    } else {
        const filteredKeys = Object.keys(window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data).filter(key => key.includes(query) && (arpabet_search_only_enabled.checked ? (window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[key].enabled) : true))

        window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].filteredData = {}
        filteredKeys.forEach(key => {
            window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].filteredData[key] = window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[key]
        })
    }

    window.refreshDictWordList()
}
let arpabetSearchInterval
arpabet_word_search_input.addEventListener("keyup", () => {
    if (arpabetSearchInterval!=null) {
        clearTimeout(arpabetSearchInterval)
    }
    arpabetSearchInterval = setTimeout(window.arpabetRunSearch, 500)
})

arpabet_enableall_button.addEventListener("click", () => {

    const dictName = window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].title
    window.confirmModal(window.i18n.ARPABET_CONFIRM_ENABLE_ALL.replace("_1", dictName)).then(response => {
        if (response) {
            const wordKeys = Object.keys(window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data)
            wordKeys.forEach(word => {
                window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[word].enabled = true
            })

            window.saveARPAbetDict(window.arpabetMenuState.currentDict)
            window.arpabetRunSearch()
        }
    })
})

arpabet_disableall_button.addEventListener("click", () => {

    const dictName = window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].title
    window.confirmModal(window.i18n.ARPABET_CONFIRM_DISABLE_ALL.replace("_1", dictName)).then(response => {
        if (response) {
            const wordKeys = Object.keys(window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data)
            wordKeys.forEach(word => {
                window.arpabetMenuState.dictionaries[window.arpabetMenuState.currentDict].data[word].enabled = false
            })

            window.saveARPAbetDict(window.arpabetMenuState.currentDict)
            window.arpabetRunSearch()
        }
    })
})
arpabet_search_only_enabled.addEventListener("click", () => window.arpabetRunSearch())



fs.watch(`${window.path}/arpabet`, {recursive: false, persistent: true}, (eventType, filename) => {refreshDictionariesList()})