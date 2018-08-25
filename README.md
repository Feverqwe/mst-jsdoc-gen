# mst-jsdoc-gen
Simple jsdoc generator for mobx-state-tree

## Example
In model.js write:
```
import { types, onSnapshot } from "mobx-state-tree"

const Todo = types
    .model("Todo", {
        title: types.string,
        done: false
    })
    .actions(self => ({
        toggle() {
            self.done = !self.done
        }
    }))

const Store = types.model("Store", {
    todos: types.array(Todo)
})
```

After run `npm start` and see result:
```
/**
* @typedef {{}} Todo
* @property {string} title
* @property {boolean} done
* @property {function} toggle
*/


/**
* @typedef {{}} Store
* @property {Todo[]} todos
*/
```
