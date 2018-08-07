types
  .model("TodoStore", {
    loaded: types.boolean   ,
    endpoint: "http://localhost",
    todos: types.array(Todo),
    selectedTodo: types.reference(Todo)
  })
  .views(self => {
    return {
      get completedTodos() {
        return self.todos.filter(t => t.done)
      },
      findTodosByUser(user) {
        return self.todos.filter(t => t.assignee === user)
      }
    };
  })
  .actions(self => {
    return {
      addTodo(title) {
        self.todos.push({
          id: Math.random(),
          title
        })
      }
    };
  })