import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
} from "react-router-dom";
import Todos from "./routes/Todos";
import About from "./routes/About";
import Settings from "./routes/Settings";

function App() {
  return (
    <Router>
      <div className="min-w-screen min-h-screen flex flex-col bg-gray-100 text-gray-900">
        {/* Navigation */}
        <nav className="bg-blue-600 p-4 shadow-md">
          <div className="max-w-4xl mx-auto flex justify-center gap-8">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? "bg-white text-blue-600 px-3 py-1 rounded font-semibold transition-colors duration-200"
                  : "!text-white hover:underline px-3 py-1 transition-colors duration-200"
              }
            >
              Todos
            </NavLink>
            <NavLink
              to="/about"
              className={({ isActive }) =>
                isActive
                  ? "bg-white text-blue-600 px-3 py-1 rounded font-semibold transition-colors duration-200"
                  : "!text-white hover:underline px-3 py-1 transition-colors duration-200"
              }
            >
              About
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive
                  ? "bg-white text-blue-600 px-3 py-1 rounded font-semibold transition-colors duration-200"
                  : "!text-white hover:underline px-3 py-1 transition-colors duration-200"
              }
            >
              Settings
            </NavLink>
          </div>
        </nav>

        {/* Main content area */}
        <main className="flex-1 max-w-4xl mx-auto w-full p-4">
          <Routes>
            <Route path="/" element={<Todos />} />
            <Route path="/about" element={<About />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="text-center text-sm text-gray-500 p-4">
          © {new Date().getFullYear()} Task Manager App
        </footer>
      </div>
    </Router>
  );
}

export default App;
