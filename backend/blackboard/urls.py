from django.urls import path
from . import views

urlpatterns = [
    path("languages/", views.languages, name="blackboard-languages"),
    path("run/", views.run, name="blackboard-run"),
]
