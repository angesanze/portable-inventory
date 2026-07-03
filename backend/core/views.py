from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.throttling import AnonRateThrottle
from .serializers import CustomTokenObtainPairSerializer


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [LoginThrottle]
