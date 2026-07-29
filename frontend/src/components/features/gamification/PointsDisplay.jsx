import React, { useState, useEffect, useRef } from 'react';
import { Zap, TrendingUp, Award, Plus, Sparkles, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { gamificationService } from '../../../services/gamificationService';
import websocketService from '../../../services/websocketService';
import './MobileResponsive.css';

const PointsDisplay = ({ 
  showHistory = false, 
  showBreakdown = true, 
  compact = false,
  className = '' 
}) => {
  const [pointsData, setPointsData] = useState(null);
  const [recentEarnings, setRecentEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [animatingPoints, setAnimatingPoints] = useState(null);
  const previousPointsRef = useRef(0);

  const fetchPointsData = async () => {
    try {
      setLoading(true);
      const [pointsResponse, historyResponse] = await Promise.all([
        gamificationService.getUserPoints(),
        showHistory ? gamificationService.getPointsHistory({ limit: 5 }) : Promise.resolve({ data: [] })
      ]);

      if (pointsResponse.success) {
        const newPoints = pointsResponse.data;
        if (previousPointsRef.current > 0 && newPoints.total_points > previousPointsRef.current) {
          const pointsGained = newPoints.total_points - previousPointsRef.current;
          setAnimatingPoints(pointsGained);
          setTimeout(() => setAnimatingPoints(null), 3000);
        }
        previousPointsRef.current = newPoints.total_points;
        setPointsData(newPoints);
      }

      if (historyResponse.success) {
        setRecentEarnings(historyResponse.data.results || historyResponse.data);
      }

      setError(null);
    } catch (err) {
      console.error('Failed to fetch points data:', err);
      setError('Failed to load points');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPointsData();

    const connectWebSocket = async () => {
      try {
        if (websocketService.isAuthenticated) {
          await websocketService.connect('game');
          websocketService.addEventListener('game', 'points_update', () => fetchPointsData());
        }
      } catch (err) {
        // fallback polling
        const interval = setInterval(fetchPointsData, 30000);
        return () => clearInterval(interval);
      }
    };

    connectWebSocket();

    return () => {
      websocketService.removeEventListener('game', 'points_update', fetchPointsData);
    };
  }, [showHistory]);

  // Loading / Error states render compact header too
  if (loading) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Total Points
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            {showBreakdown && (
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 bg-gray-100 rounded animate-pulse"></div>
                <div className="h-16 bg-gray-100 rounded animate-pulse"></div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !pointsData) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Total Points
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-gray-500 text-sm">{error || 'No points data available'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // cardClass controls inline display for compact variant
  const cardClass = `${className} ${compact ? 'inline-flex items-center px-3 py-2' : ''}`;

  return (
    <Card className={cardClass}>
      <AnimatePresence>
        {animatingPoints && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.8 }}
            className="absolute top-2 right-2 z-10 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            {animatingPoints}
          </motion.div>
        )}
      </AnimatePresence>

      <CardHeader className={`${compact ? 'p-0' : 'pb-3'}`}>
        <CardTitle className={`text-lg ${compact ? 'text-sm' : ''} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <span className={`${compact ? 'font-medium' : ''}`}>Total Points</span>
          </div>

          <div className="flex items-center gap-3">
            {compact && (
              <span className="text-xl font-bold text-gray-900">{(pointsData?.total_points || 0).toLocaleString()}</span>
            )}
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="w-3 h-3 mr-1" />
              Live
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      {/* For compact: header already shows number; skip large box */}
      {!compact && (
        <CardContent className="pt-0">
          <motion.div
            key={pointsData?.total_points || 0}
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 0.3 }}
            className="mb-4 points-display-main"
          >
            <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border border-yellow-200">
              <div className="flex items-center justify-center mb-1">
                <span className="text-2xl sm:text-3xl font-bold text-gray-900 points-display-total">
                  {(pointsData?.total_points || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </motion.div>

          {showBreakdown && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 points-display-breakdown">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-900">Practice</span>
                </div>
                <p className="text-xl font-bold text-blue-900">
                  {pointsData.practice_points?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-blue-600">points</p>
              </div>

              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <Award className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-900">Assignments</span>
                </div>
                <p className="text-xl font-bold text-green-900">
                  {pointsData.assignment_points?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-green-600">points</p>
              </div>
            </div>
          )}

          {showHistory && recentEarnings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Recent Earnings
              </h4>
              <div className="space-y-2">
                {recentEarnings.map((earning, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-700">{earning.source || 'Practice Question'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Plus className="w-3 h-3 text-green-600" />
                      <span className="text-sm font-semibold text-green-600">{earning.points}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {showHistory && recentEarnings.length === 0 && (
            <div className="text-center py-4">
              <Zap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No recent earnings</p>
              <p className="text-xs text-gray-400">Complete practice questions to earn points!</p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Last updated: {pointsData?.last_updated ? new Date(pointsData.last_updated).toLocaleTimeString() : 'Never'}</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Live</span>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default PointsDisplay;
