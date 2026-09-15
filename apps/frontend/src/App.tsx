import "../styles/globals.css";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { Reviews } from "./components/Reviews";
import { ReviewDetail } from "./components/ReviewDetail";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProfileProvider } from "./context/ProfileContext";

export function App() {
  return (
    <ProfileProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Form />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/result/:id" element={<Result />} />
          <Route path="/result" element={<Result />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reviews/:id" element={<ReviewDetail />} />
        </Routes>
      </BrowserRouter>
    </ProfileProvider>
  );
}

export default App;
