from django.http import JsonResponse
from django.views import View
from django.core.management import call_command
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import io


@method_decorator(csrf_exempt, name='dispatch')
class SeedE2EView(View):
    """
    API endpoint to run E2E seed command.
    Only available in DEBUG mode for security.
    """
    
    def post(self, request):
        if not settings.DEBUG:
            return JsonResponse({'error': 'Not available in production'}, status=403)
        
        try:
            output = io.StringIO()
            call_command('seed_e2e', stdout=output)
            return JsonResponse({
                'success': True,
                'message': 'E2E seed completed',
                'output': output.getvalue()
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=500)
    
    def get(self, request):
        return JsonResponse({'message': 'Use POST to seed E2E data'})
