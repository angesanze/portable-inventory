import time
import logging
from django.db import connection

logger = logging.getLogger(__name__)

class QueryCountMiddleware:
    """
    Middleware to log the number of database queries and execution time for each request.
    Useful for performance monitoring and identifying N+1 issues.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = time.time()
        start_queries = len(connection.queries)
        
        response = self.get_response(request)
        
        end_queries = len(connection.queries)
        duration = time.time() - start_time
        
        query_count = end_queries - start_queries
        
        # Log performance data if query count is high or duration is long
        # In a real app, you might want to log this only in DEBUG or for specific paths
        if query_count > 10 or duration > 0.5:
            logger.info(
                f"PERF: {request.method} {request.path} | "
                f"Queries: {query_count} | Duration: {duration:.3f}s"
            )
            
        # Add headers for easier debugging in browser
        response['X-Query-Count'] = str(query_count)
        response['X-Duration'] = f"{duration:.3f}s"
        
        return response
