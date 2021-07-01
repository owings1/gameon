/*
static _buildStyles(_styles) {

    // Minimal defaults.
    const styles = {
        'text.color'      : 'white'
      , 'text.background' : 'black'
      , ..._styles
    }

    // Default aliases.
    Object.entries(Aliases).forEach(([key, alias]) => {
        if (!styles[key] && styles[alias]) {
            styles[key] = styles[alias]
        }
    })

    // TODO: try to remove defaults and just use base chalk
    // Additional defaults for text/board sections.
    Keys.forEach(key => {
        const section = getStyleSection(key)
        const type  = getStyleType(key)
        if (!styles[key]) {
            if (type == 'background') {
                if (section == 'board') {
                    styles[key] = styles['board.inside.background']
                } else {
                    styles[key] = styles['text.background']
                }
                //console.log({key})
            } else if (type == 'color') {
                if (section == 'board') {
                    styles[key] = styles['board.inside.color']
                } else {
                    styles[key] = styles['text.color']
                }
                //console.log({key})
            }
        }
    })

    return styles
}

static _buildChalks(defs) {

    const chalks = {}

    Categories.forEach(category => {

        const bgKey = category + '.background'
        const fgKey = category + '.color'
        const bgDef = defs[bgKey]
        const fgDef = defs[fgKey]

        const section = getStyleSection(category)
        var bgDef = defs[bgKey]
        var fgDef = defs[fgKey]
         // TODO: try to remove defaults and just use base chalk
        if (!fgDef) {
            // default to board or text color
            if (section == 'board') {
                fgDef = defs['board.inside.color']
            } else {
                fgDef = defs['text.color']
            }
        }
        if (!bgDef) {
            // default to board or text background
            if (section == 'board') {
                bgDef = defs['board.inside.background']
            } else {
                bgDef = defs['text.background']
            }
        }

        const result = StyleHelper.buildChalkListFromDefs(fgDef, bgDef)

        chalks[category] = result[0]
        chalks[fgKey]    = result[1]
        chalks[bgKey]    = result[2]
    })

    return chalks
}
*/