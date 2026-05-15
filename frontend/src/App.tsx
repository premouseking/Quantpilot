import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Spin } from "antd";
import { AppLayout } from "./layout/AppLayout";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DataPage = lazy(() => import("./pages/DataPage"));
const StrategiesPage = lazy(() => import("./pages/StrategiesPage"));
const BacktestPage = lazy(() => import("./pages/BacktestPage"));
const BacktestRunsPage = lazy(() => import("./pages/BacktestRunsPage"));
const BacktestReportPage = lazy(() => import("./pages/BacktestReportPage"));
const OptimizationPage = lazy(() => import("./pages/OptimizationPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));

const PageFallback: React.FC = () => (
  <div style={{ padding: 64, textAlign: "center" }}>
    <Spin />
  </div>
);

export const App: React.FC = () => {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="strategies" element={<StrategiesPage />} />
          <Route path="backtest" element={<BacktestPage />} />
          <Route path="runs" element={<BacktestRunsPage />} />
          <Route path="runs/:runId" element={<BacktestReportPage />} />
          <Route path="optimization" element={<OptimizationPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="marketplace" element={<MarketplacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
};
