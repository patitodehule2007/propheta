import type { JSX } from "react";
import { Route, Routes } from "react-router-dom";

/**
 * Application root. Domain routes will be added here.
 */
export function App(): JSX.Element {
    return (
        <Routes>
            <Route path="/" element={<div>Propheta</div>} />
        </Routes>
    );
}
