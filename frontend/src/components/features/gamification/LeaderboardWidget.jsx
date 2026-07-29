import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Crown, Medal, TrendingUp, Users, Zap, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { gamificationService } from '../../../services/gamificationService';
import { useLeaderboardWebSocket, useAuthenticatedWebSocket } from '../../../hooks/useWebSocket';
import { tokenManager } from '../../../utils/tokenManager';
import './MobileResponsive.css';

const LeaderboardWidget = ({
  type = 'global',
  classId = null,
  limit = 10,
  showUserRank = true,
  compact = false,
  className = '',
  scrollable = false,
  entriesMaxHeightClass = 'max-h-[340px]'
}) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [userRank, setUserRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previousData, setPreviousData] = useState([]);

  // WebSocket integration
  const { isAuthenticated, setAuthToken } = useAuthenticatedWebSocket();
  const {
    connectionStatus,
    leaderboardData: wsLeaderboardData,
    userRank: wsUserRank,
    connect,
    requestLeaderboard,
    requestUserRank,
    isConnected
  } = useLeaderboardWebSocket();

  // Set auth token from sessionStorage via tokenManager on mount
  useEffect(() => {
    const token = tokenManager.getAccessToken();
    if (token) {
      setAuthToken(token);
    }
  }, [setAuthToken]);

  // Connect to WebSocket when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connect().catch(error => {
        console.warn('Failed to connect to leaderboard WebSocket:', error);
      });
    }
  }, [isAuthenticated, connect]);

  // Request initial data when connected
  useEffect(() => {
    if (isConnected) {
      requestLeaderboard(type, classId, 1, limit);
      if (showUserRank) {
        requestUserRank(type, classId);
      }
    }
  }, [isConnected, type, classId, limit, showUserRank, requestLeaderboard, requestUserRank]);

  // Update local state when WebSocket data changes
  useEffect(() => {
    if (wsLeaderboardData && wsLeaderboardData.entries) {
      setPreviousData(leaderboardData);
      setLeaderboardData(wsLeaderboardData.entries);
      setLoading(false);
      setError(null);
    }
  }, [wsLeaderboardData, leaderboardData]);

  useEffect(() => {
    if (wsUserRank) {
      setUserRank(wsUserRank);
    }
  }, [wsUserRank]);

  // Fallback to REST API if WebSocket is not available
  const fetchLeaderboardData = async () => {
    try {
      setLoading(true);
      // daily/weekly boards don't support per-user rank lookup
      const supportsUserRank = showUserRank && type === 'global';

      const [leaderboardResponse, rankResponse] = await Promise.all([
        gamificationService.getLeaderboard(type, classId, limit),
        supportsUserRank
          ? gamificationService.getUserRank(type, classId)
          : Promise.resolve({ data: null }),
      ]);

      if (leaderboardResponse.success) {
        setPreviousData(leaderboardData);
        const leaderboardResult = leaderboardResponse.data.leaderboard || leaderboardResponse.data.results || leaderboardResponse.data;
        setLeaderboardData(Array.isArray(leaderboardResult) ? leaderboardResult : []);
      }

      if (rankResponse.success && rankResponse.data) {
        setUserRank(rankResponse.data);
      }

      setError(null);
    } catch (err) {
      console.error('Failed to fetch leaderboard data:', err);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  // Always load via REST API on mount; WebSocket updates will override if connected
  useEffect(() => {
    fetchLeaderboardData();
  }, [type, classId, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll via REST when WebSocket is not connected
  useEffect(() => {
    if (!isConnected) {
      const interval = setInterval(fetchLeaderboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, type, classId, limit]); // eslint-disable-line react-hooks/exhaustive-deps


  // Get rank change indicator
  const getRankChange = (currentRank, userId) => {
    const previousEntry = previousData.find(entry => entry.user.id === userId);
    if (!previousEntry) return null;

    const rankDiff = previousEntry.rank - currentRank;
    if (rankDiff > 0) return { direction: 'up', change: rankDiff };
    if (rankDiff < 0) return { direction: 'down', change: Math.abs(rankDiff) };
    return null;
  };

  // Get rank icon based on position
  const getRankIcon = (rank) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-600" />;
      default:
        return <Trophy className="w-4 h-4 text-gray-400" />;
    }
  };

  // Get rank styling
  const getRankStyling = (rank) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 dark:from-yellow-900/30 dark:to-amber-900/30 dark:border-yellow-700';
      case 2:
        return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200';
      case 3:
        return 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200';
      default:
        return 'bg-white border-gray-100';
    }
  };

  if (loading) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5 text-indigo-600" />
            {type === 'global' ? 'Global Leaderboard' : 'Class Leaderboard'}
            {isConnected && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                Live
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 animate-pulse">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-12"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5 text-indigo-600" />
            {type === 'global' ? 'Global Leaderboard' : 'Class Leaderboard'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">{error}</p>
            <p className="text-xs text-gray-400 mb-4">
              Backend gamification API not available yet
            </p>
            <Button onClick={fetchLeaderboardData} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className} overflow-hidden leaderboard-widget`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-indigo-600" />
            {type === 'global' ? 'Global Leaderboard' : 'Class Leaderboard'}
            {isConnected && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                Live
              </Badge>
            )}
          </div>
          <Badge variant="secondary" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            {leaderboardData.length}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {/* User's Current Rank (if not in top list) */}
        {userRank && userRank.user_rank > limit && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-indigo-700">#{userRank.user_rank}</span>
                </div>
                <div>
                  <p className="font-semibold text-indigo-900">Your Rank</p>
                  <p className="text-xs text-indigo-600">{userRank.user_data?.total_points || 0} points</p>
                </div>
              </div>
              <Badge variant="outline" className="text-indigo-600 border-indigo-200">
                You
              </Badge>
            </div>
          </motion.div>
        )}

        {/* Leaderboard Entries */}
        <div className={`${scrollable ? `${entriesMaxHeightClass} overflow-y-auto pr-1` : ''} space-y-2`}>
          <AnimatePresence mode="popLayout">
            {leaderboardData.map((entry, index) => {
              const rankChange = getRankChange(entry.rank, entry.user.id);
              const isCurrentUser = userRank && entry.user.id === userRank.user_data?.user?.id;

              return (
                <motion.div
                  key={entry.user.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 leaderboard-entry
                    ${getRankStyling(entry.rank)}
                    ${isCurrentUser ? 'ring-2 ring-indigo-200 ring-offset-1' : ''}
                    hover:shadow-md
                  `}
                >
                  {/* Rank and Icon */}
                  <div className="flex items-center gap-2 min-w-[60px]">
                    <div className="flex items-center justify-center w-8 h-8">
                      {entry.rank <= 3 ? (
                        getRankIcon(entry.rank)
                      ) : (
                        <span className="text-sm font-bold text-gray-600">#{entry.rank}</span>
                      )}
                    </div>

                    {/* Rank Change Indicator */}
                    {rankChange && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={`
                          flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold
                          ${rankChange.direction === 'up'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                          }
                        `}
                      >
                        {rankChange.direction === 'up' ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        {rankChange.change}
                      </motion.div>
                    )}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="leaderboard-entry-header sm:block">
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold truncate ${isCurrentUser ? 'text-indigo-900' : 'text-gray-900'
                          }`}>
                          {entry.user.first_name && entry.user.last_name
                            ? `${entry.user.first_name} ${entry.user.last_name}`
                            : entry.user.username
                          }
                        </p>
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-200">
                            You
                          </Badge>
                        )}
                      </div>
                      {!compact && entry.completed_problems > 0 && (
                        <p className="text-xs text-gray-500 leaderboard-entry-details sm:mt-0 mt-1">
                          {entry.completed_problems} problems solved
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="font-bold text-gray-900">{entry.total_points}</span>
                    </div>
                    {!compact && (
                      <p className="text-xs text-gray-500">points</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {leaderboardData.length === 0 && !loading && (
          <div className="text-center py-8">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            {type === 'daily' ? (
              <>
                <p className="text-gray-500 mb-2">No activity yet today</p>
                <p className="text-xs text-gray-400">Submit a practice question to appear here!</p>
              </>
            ) : type === 'weekly' ? (
              <>
                <p className="text-gray-500 mb-2">No activity this week</p>
                <p className="text-xs text-gray-400">Submit a practice question to appear here!</p>
              </>
            ) : (
              <>
                <p className="text-gray-500 mb-2">No rankings yet</p>
                <p className="text-xs text-gray-400">Complete some practice questions to get started!</p>
              </>
            )}
          </div>
        )}


        {/* Footer */}
        {leaderboardData.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{isConnected ? 'Updates in real-time' : 'Polling for updates'}</span>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span className={isConnected ? 'text-green-600' : 'text-gray-500'}>
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LeaderboardWidget;
