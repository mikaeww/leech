// A tree of {id, title, url} sites and {id, title, children} folders, saved whole on every change.
const uid = () => crypto.randomUUID()

export class Bookmarks {
  constructor (tree = [], save = () => {}) {
    this.tree = tree
    this.save = () => save(this.tree)
  }

  *walk (list = this.tree, parent = null) {
    for (const node of list) {
      yield [node, parent]
      if (node.children) yield * this.walk(node.children, node)
    }
  }

  find (id) {
    for (const [node, parent] of this.walk()) if (node.id === id) return { node, parent }
    return null
  }

  has (url) {
    for (const [node] of this.walk()) if (node.url === url) return true
    return false
  }

  get count () {
    let n = 0
    for (const [node] of this.walk()) if (node.url) n++
    return n
  }

  countIn (folder) {
    let n = 0
    for (const [node] of this.walk(folder.children || [])) if (node.url) n++
    return n
  }

  folders () {
    return [...this.walk()].filter(([node]) => node.children).map(([node]) => node)
  }

  add (url, title) {
    if (this.has(url)) return false
    this.tree.unshift({ id: uid(), title: title || url, url })
    this.save()
    return true
  }

  addFolder (title) {
    this.tree.push({ id: uid(), title, children: [] })
    this.save()
  }

  remove (id) {
    const hit = this.find(id)
    if (!hit) return
    const list = hit.parent ? hit.parent.children : this.tree
    list.splice(list.indexOf(hit.node), 1)
    this.save()
  }

  rename (id, title) {
    const hit = this.find(id)
    if (hit && title.trim()) { hit.node.title = title.trim(); this.save() }
  }

  /** Into a folder, or to the top level with `into` null; never into itself or below itself. */
  move (id, into) {
    const hit = this.find(id)
    if (!hit) return false
    if (into) {
      const target = this.find(into)?.node
      if (!target?.children || target === hit.node) return false
      for (const [node] of this.walk(hit.node.children || [])) if (node === target) return false
    }
    const from = hit.parent ? hit.parent.children : this.tree
    from.splice(from.indexOf(hit.node), 1)
    ;(into ? this.find(into).node.children : this.tree).push(hit.node)
    this.save()
    return true
  }

  /** An import: the whole tree if there was nothing yet, otherwise one top-level folder named after the browser. */
  take (browser, tree) {
    const give = list => list.map(n => n.children ? { id: uid(), title: n.title, children: give(n.children) } : { id: uid(), title: n.title, url: n.url })
    const imported = give(tree)
    if (!this.tree.length) this.tree = imported
    else {
      const old = this.tree.findIndex(n => n.children && n.title === browser)
      const folder = { id: uid(), title: browser, children: imported }
      if (old >= 0) this.tree[old] = folder
      else this.tree.push(folder)
    }
    this.save()
  }
}
