document.addEventListener("DOMContentLoaded", function() {
    // DOM elementi
    const todoInput = document.getElementById("todo-input");
    const addBtn = document.getElementById("add-btn");
    const todoList = document.getElementById("todo-list");
    const filterBtns = document.querySelectorAll(".filter-btn");
    const clearCompletedBtn = document.getElementById("clear-completed");
    const itemsLeftSpan = document.getElementById("items-left");
    
    // Učitaj zadatke iz lokalne pohrane ili koristi prazan niz
    let todos = JSON.parse(localStorage.getItem("todos")) || [];
    let currentFilter = "all";
    
    // Inicijalno iscrtavanje
    renderTodos();
    updateItemsLeft();
    
    // Event listener za dodavanje novog zadatka
    addBtn.addEventListener("click", addTodo);
    todoInput.addEventListener("keypress", function(e) {
        if (e.key === "Enter") addTodo();
    });
    
    // Event listener za brisanje završenih zadataka
    clearCompletedBtn.addEventListener("click", clearCompleted);
    
    // Event listeneri za filtere
    filterBtns.forEach(btn => {
        btn.addEventListener("click", function() {
            currentFilter = this.getAttribute("data-filter");
            filterBtns.forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            renderTodos();
        });
    });
    
    // Funkcija za dodavanje novog zadatka
    function addTodo() {
        const todoText = todoInput.value.trim();
        
        if (todoText !== "") {
            const newTodo = {
                id: Date.now(),
                text: todoText,
                completed: false
            };
            
            todos.push(newTodo);
            saveTodos();
            todoInput.value = "";
            renderTodos();
            updateItemsLeft();
        }
    }
    
    // Funkcija za završavanje/odznačavanje zadatka
    function toggleTodo(id) {
        todos = todos.map(todo => {
            if (todo.id === id) {
                todo.completed = !todo.completed;
            }
            return todo;
        });
        
        saveTodos();
        renderTodos();
        updateItemsLeft();
    }
    
    // Funkcija za brisanje zadatka
    function deleteTodo(id) {
        todos = todos.filter(todo => todo.id !== id);
        saveTodos();
        renderTodos();
        updateItemsLeft();
    }
    
    // Funkcija za brisanje završenih zadataka
    function clearCompleted() {
        todos = todos.filter(todo => !todo.completed);
        saveTodos();
        renderTodos();
    }
    
    // Funkcija za iscrtavanje zadataka
    function renderTodos() {
        // Očisti listu
        todoList.innerHTML = "";
        
        // Filtriraj zadatke prema odabranom filteru
        let filteredTodos = todos;
        if (currentFilter === "active") {
            filteredTodos = todos.filter(todo => !todo.completed);
        } else if (currentFilter === "completed") {
            filteredTodos = todos.filter(todo => todo.completed);
        }
        
        // Prikaži zadatke
        filteredTodos.forEach(todo => {
            const li = document.createElement("li");
            if (todo.completed) {
                li.classList.add("completed");
            }
            
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "checkbox";
            checkbox.checked = todo.completed;
            checkbox.addEventListener("change", () => toggleTodo(todo.id));
            
            const span = document.createElement("span");
            span.className = "todo-text";
            span.textContent = todo.text;
            
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-btn";
            deleteBtn.innerHTML = "×";
            deleteBtn.addEventListener("click", () => deleteTodo(todo.id));
            
            li.appendChild(checkbox);
            li.appendChild(span);
            li.appendChild(deleteBtn);
            todoList.appendChild(li);
        });
    }
    
    // Funkcija za ažuriranje broja preostalih zadataka
    function updateItemsLeft() {
        const activeCount = todos.filter(todo => !todo.completed).length;
        itemsLeftSpan.textContent = `${activeCount} preostalih stavki`;
    }
    
    // Funkcija za spremanje zadataka u lokalnu pohranu
    function saveTodos() {
        localStorage.setItem("todos", JSON.stringify(todos));
    }
}); 