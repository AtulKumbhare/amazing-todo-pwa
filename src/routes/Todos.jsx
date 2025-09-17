import { useEffect, useState } from "react";
import localforage from "localforage";

// API_BASE and localForage helpers (lfGetPending, lfSetPending, etc.)
const API_BASE = "https://amazing-task-backend.onrender.com/api";

async function lfGetPending() {
  return (await localforage.getItem("pending")) || [];
}

async function lfSetPending(list) {
  await localforage.setItem("pending", list);
}

function genClientId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function lfPendingPush(entry) {
  const list = await lfGetPending();
  const withId = { ...entry, clientId: genClientId() };
  list.push(withId);
  await lfSetPending(list);
  return withId.clientId;
}

async function lfPendingRemove(clientId) {
  const list = await lfGetPending();
  const next = list.filter((p) => p.clientId !== clientId);
  await lfSetPending(next);
}

function Todos() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    (async () => {
      let pendingList = await lfGetPending();
      pendingList = pendingList?.map((item) => item?.payload);
      if ("caches" in window) {
        const cache = await caches.open("todo-cache-v1");
        const cached = await cache.match(`${API_BASE}/todos`);
        if (cached) {
          const data = await cached.json();
          setTodos([...pendingList, ...data]);
        }
      }
      if (navigator.onLine) {
        await syncWithServer();
        const res = await fetch(`${API_BASE}/todos`);
        if (res.ok) {
          const data = await res.json();
          setTodos(data);
          if ("caches" in window) {
            const cache = await caches.open("todo-cache-v1");
            await cache.put(`${API_BASE}/todos`, res.clone());
          }
        }
      }
    })();

    const onOnline = () => {
      setIsOnline(true);
      syncWithServer();
    };
    const onOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function syncWithServer() {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const pending = await lfGetPending();
      for (const change of pending) {
        const { op, payload } = change;
        if (op === "create") {
          const { title, completed, updatedAt } = payload;
          const res = await fetch(`${API_BASE}/todos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, completed, updatedAt }),
          });
          if (res.ok) await lfPendingRemove(change.clientId);
        } else if (op === "update") {
          const res = await fetch(`${API_BASE}/todos/${payload.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) await lfPendingRemove(change.clientId);
        } else if (op === "delete") {
          const res = await fetch(`${API_BASE}/todos/${payload.id}`, {
            method: "DELETE",
          });
          if (res.status === 204 || res.status === 404)
            await lfPendingRemove(change.clientId);
        }
      }
      const res = await fetch(`${API_BASE}/todos`);
      if (res.ok) {
        const data = await res.json();
        setTodos(data);
        if ("caches" in window) {
          const cache = await caches.open("todo-cache-v1");
          await cache.put(`${API_BASE}/todos`, res.clone());
        }
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  }

  async function addTodo(e) {
    e.preventDefault();
    const title = input.trim();
    if (!title) return;
    const newTodo = {
      title,
      completed: false,
      updatedAt: new Date().toISOString(),
      localOnly: true,
    };
    setTodos([newTodo, ...todos]);
    setInput("");

    if (navigator.onLine) {
      try {
        const res = await fetch(`${API_BASE}/todos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newTodo.title,
            completed: newTodo.completed,
            updatedAt: newTodo.updatedAt,
          }),
        });
        if (!res.ok) throw new Error("Failed to create on server");
      } catch {
        await lfPendingPush({
          op: "create",
          payload: {
            title: newTodo.title,
            completed: newTodo.completed,
            updatedAt: newTodo.updatedAt,
          },
        });
      }
    } else {
      await lfPendingPush({
        op: "create",
        payload: {
          title: newTodo.title,
          completed: newTodo.completed,
          updatedAt: newTodo.updatedAt,
        },
      });
    }
  }

  async function toggleTodo(todo) {
    const updated = {
      ...todo,
      completed: !todo.completed,
      updatedAt: new Date().toISOString(),
    };
    setTodos(todos.map((t) => (t.id === todo.id ? updated : t)));

    if (navigator.onLine && !String(updated.id).startsWith("p_")) {
      try {
        const res = await fetch(`${API_BASE}/todos/${updated.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (!res.ok) throw new Error("Failed to update");
      } catch {
        await lfPendingPush({ op: "update", payload: updated });
      }
    } else {
      await lfPendingPush({ op: "update", payload: updated });
    }
  }

  async function deleteTodo(todo) {
    setTodos(todos.filter((t) => t.id !== todo.id));

    if (navigator.onLine && !String(todo.id).startsWith("p_")) {
      try {
        const res = await fetch(`${API_BASE}/todos/${todo.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");
      } catch {
        await lfPendingPush({ op: "delete", payload: { id: todo.id } });
      }
    } else {
      await lfPendingPush({ op: "delete", payload: { id: todo.id } });
    }
  }

  async function renameTodo(todo, title) {
    const updated = {
      ...todo,
      title: title.trim(),
      updatedAt: new Date().toISOString(),
    };
    setTodos(todos.map((t) => (t.id === todo.id ? updated : t)));

    if (navigator.onLine && !String(updated.id).startsWith("p_")) {
      try {
        const res = await fetch(`${API_BASE}/todos/${updated.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (!res.ok) throw new Error("Failed to rename");
      } catch {
        await lfPendingPush({ op: "update", payload: updated });
      }
    } else {
      await lfPendingPush({ op: "update", payload: updated });
    }
  }

  return (
    <div className="bg-white shadow rounded p-6">
      <h1 className="text-2xl font-bold mb-4 text-blue-600 text-center">
        Task Manager
      </h1>
      <form onSubmit={addTodo} className="flex gap-2 mb-4">
        <input
          placeholder="Add a new task..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 p-3 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add
        </button>
      </form>

      <div className="flex items-center gap-2 mb-4 justify-center">
        <span
          className={`w-3 h-3 rounded-full ${
            isOnline ? "bg-green-500" : "bg-red-500"
          }`}
        ></span>
        <small>
          {isOnline ? "Online" : "Offline"}
          {isSyncing ? " · Syncing…" : ""}
        </small>
      </div>

      <ul className="space-y-2">
        {todos.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 p-3 border rounded-md border-gray-200 hover:shadow-sm"
          >
            <input
              type="checkbox"
              checked={!!t.completed}
              onChange={() => toggleTodo(t)}
              className="h-5 w-5 text-blue-600 rounded"
            />
            <input
              value={t.title}
              onChange={(e) => renameTodo(t, e.target.value)}
              className={`flex-1 p-2 border rounded-md ${
                t.completed ? "line-through text-gray-500" : ""
              }`}
            />
            <button
              onClick={() => deleteTodo(t)}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {todos.length === 0 && (
        <p className="text-center text-gray-500 mt-4">No tasks available.</p>
      )}
    </div>
  );
}

export default Todos;
