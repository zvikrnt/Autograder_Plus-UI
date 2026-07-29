"""
WebSocket consumers for real-time gamification updates.
"""

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.serializers.json import DjangoJSONEncoder

logger = logging.getLogger(__name__)
User = get_user_model()


def _json_dumps(data):
    return json.dumps(data, cls=DjangoJSONEncoder)


class LeaderboardConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time leaderboard updates.
    
    Handles:
    - Global leaderboard updates
    - Class-specific leaderboard updates
    - User rank changes
    - Achievement notifications
    """
    
    async def connect(self):
        """Accept WebSocket connection and join appropriate groups."""
        self.user = self.scope.get("user", AnonymousUser())
        self.global_group_name = None
        self.class_groups = []
        self.user_group_name = None
        
        # Only allow authenticated users
        if isinstance(self.user, AnonymousUser):
            await self.close()
            return
        
        # Join global leaderboard group
        self.global_group_name = "leaderboard_global"
        await self.channel_layer.group_add(
            self.global_group_name,
            self.channel_name
        )
        
        # Join class-specific leaderboard groups for user's classes
        user_classes = await self.get_user_classes()
        
        for class_id in user_classes:
            class_group_name = f"leaderboard_class_{class_id}"
            self.class_groups.append(class_group_name)
            await self.channel_layer.group_add(
                class_group_name,
                self.channel_name
            )
        
        # Join user-specific group for personal notifications
        self.user_group_name = f"user_{self.user.id}"
        await self.channel_layer.group_add(
            self.user_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send initial leaderboard data
        await self.send_initial_data()
    
    async def disconnect(self, close_code):
        """Leave all groups when disconnecting."""
        # Leave global group
        if self.global_group_name:
            await self.channel_layer.group_discard(
                self.global_group_name,
                self.channel_name
            )
        
        # Leave class groups
        for class_group in self.class_groups:
            await self.channel_layer.group_discard(
                class_group,
                self.channel_name
            )
        
        # Leave user group
        if self.user_group_name:
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'request_leaderboard':
                await self.handle_leaderboard_request(data)
            elif message_type == 'request_user_rank':
                await self.handle_user_rank_request(data)
            else:
                await self.send(text_data=_json_dumps({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                }))
                
        except json.JSONDecodeError:
            await self.send(text_data=_json_dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
            await self.send(text_data=_json_dumps({
                'type': 'error',
                'message': 'Internal server error'
            }))
    
    async def handle_leaderboard_request(self, data):
        """Handle request for leaderboard data."""
        leaderboard_type = data.get('leaderboard_type', 'global')
        class_id = data.get('class_id')
        page = data.get('page', 1)
        page_size = data.get('page_size', 20)
        
        leaderboard_data = await self.get_leaderboard_data(
            leaderboard_type, class_id, page, page_size
        )
        
        await self.send(text_data=_json_dumps({
            'type': 'leaderboard_data',
            'leaderboard_type': leaderboard_type,
            'class_id': class_id,
            'data': leaderboard_data
        }))
    
    async def handle_user_rank_request(self, data):
        """Handle request for user's current rank."""
        leaderboard_type = data.get('leaderboard_type', 'global')
        class_id = data.get('class_id')
        
        user_rank_data = await self.get_user_rank_data(
            leaderboard_type, class_id
        )
        
        await self.send(text_data=_json_dumps({
            'type': 'user_rank_data',
            'leaderboard_type': leaderboard_type,
            'class_id': class_id,
            'data': user_rank_data
        }))
    
    async def send_initial_data(self):
        """Send initial leaderboard and user data upon connection."""
        # Send global leaderboard
        global_data = await self.get_leaderboard_data('global', None, 1, 10)
        await self.send(text_data=_json_dumps({
            'type': 'initial_global_leaderboard',
            'data': global_data
        }))
        
        # Send user's global rank
        user_rank = await self.get_user_rank_data('global', None)
        await self.send(text_data=_json_dumps({
            'type': 'initial_user_rank',
            'data': user_rank
        }))
    
    # Group message handlers
    async def leaderboard_update(self, event):
        """Handle leaderboard update broadcast."""
        await self.send(text_data=_json_dumps({
            'type': 'leaderboard_update',
            'leaderboard_type': event['leaderboard_type'],
            'class_id': event.get('class_id'),
            'data': event['data']
        }))
    
    async def rank_change(self, event):
        """Handle user rank change notification."""
        await self.send(text_data=_json_dumps({
            'type': 'rank_change',
            'old_rank': event['old_rank'],
            'new_rank': event['new_rank'],
            'leaderboard_type': event['leaderboard_type'],
            'class_id': event.get('class_id')
        }))
    
    async def achievement_earned(self, event):
        """Handle achievement earned notification."""
        await self.send(text_data=_json_dumps({
            'type': 'achievement_earned',
            'achievement': event['achievement'],
            'points_earned': event.get('points_earned', 0)
        }))
    
    async def points_update(self, event):
        """Handle points update notification."""
        await self.send(text_data=_json_dumps({
            'type': 'points_update',
            'old_points': event['old_points'],
            'new_points': event['new_points'],
            'points_earned': event['points_earned'],
            'source': event.get('source', 'unknown')
        }))
    
    # Database query methods
    @database_sync_to_async
    def get_user_classes(self):
        """Get list of class IDs the user belongs to."""
        from classes.models import Class, Enrollment
        
        user_classes = Class.objects.filter(
            enrollments__user=self.user,
            enrollments__role='student'
        ).values_list('id', flat=True)
        
        return [str(class_id) for class_id in user_classes]
    
    @database_sync_to_async
    def get_leaderboard_data(self, leaderboard_type, class_id, page, page_size):
        """Get leaderboard data from database."""
        from .leaderboard_manager import LeaderboardManagerStatic
        
        return LeaderboardManagerStatic.get_leaderboard_page(
            leaderboard_type=leaderboard_type,
            class_id=class_id,
            page=page,
            page_size=page_size
        )
    
    @database_sync_to_async
    def get_user_rank_data(self, leaderboard_type, class_id):
        """Get user's rank data from database."""
        from .leaderboard_manager import LeaderboardManagerStatic
        
        return LeaderboardManagerStatic.get_user_rank(
            user=self.user,
            leaderboard_type=leaderboard_type,
            class_id=class_id
        )


class GameConsumer(AsyncWebsocketConsumer):
    """
    General-purpose consumer for gamification events.
    
    Handles:
    - Practice question completion notifications
    - Assignment submission notifications
    - General gamification events
    """
    
    async def connect(self):
        """Accept WebSocket connection."""
        self.user = self.scope.get("user", AnonymousUser())
        self.user_group_name = None
        
        # Only allow authenticated users
        if isinstance(self.user, AnonymousUser):
            await self.close()
            return
        
        # Join user-specific group
        self.user_group_name = f"game_user_{self.user.id}"
        await self.channel_layer.group_add(
            self.user_group_name,
            self.channel_name
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """Leave user group when disconnecting."""
        if self.user_group_name:
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            # Echo back for now - can be extended for specific game events
            await self.send(text_data=_json_dumps({
                'type': 'echo',
                'message': f'Received: {message_type}'
            }))
            
        except json.JSONDecodeError:
            await self.send(text_data=_json_dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
    
    # Group message handlers
    async def practice_completed(self, event):
        """Handle practice question completion notification."""
        await self.send(text_data=_json_dumps({
            'type': 'practice_completed',
            'question_title': event['question_title'],
            'points_earned': event['points_earned'],
            'attempt_number': event['attempt_number']
        }))
    
    async def assignment_submitted(self, event):
        """Handle assignment submission notification."""
        await self.send(text_data=_json_dumps({
            'type': 'assignment_submitted',
            'assignment_title': event['assignment_title'],
            'points_earned': event['points_earned'],
            'score': event.get('score')
        }))
    
    async def streak_update(self, event):
        """Handle streak update notification."""
        await self.send(text_data=_json_dumps({
            'type': 'streak_update',
            'current_streak': event['current_streak'],
            'streak_type': event['streak_type']
        }))